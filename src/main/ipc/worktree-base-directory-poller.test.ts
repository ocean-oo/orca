import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  startWorktreeBaseDirectoryPoller,
  type WorktreeBasePollEvent
} from './worktree-base-directory-poller'
import type {
  WorktreeBaseRepoWatchConfig,
  WorktreeBaseWatchTarget
} from './worktree-base-directory-event-filter'

const POLL_MS = 25

function makeTarget(
  kind: 'base' | 'git-common',
  path: string,
  config: Partial<WorktreeBaseRepoWatchConfig> = {}
): WorktreeBaseWatchTarget {
  const repoConfig: WorktreeBaseRepoWatchConfig = {
    repoId: 'repo-1',
    repoName: 'project',
    nestWorkspaces: false,
    ...config
  }
  return {
    key: `${kind}:local:${path}`,
    kind,
    path,
    repos: new Map([[repoConfig.repoId, repoConfig]])
  }
}

async function waitForEvents(
  events: WorktreeBasePollEvent[][],
  predicate: (flat: WorktreeBasePollEvent[]) => boolean
): Promise<WorktreeBasePollEvent[]> {
  await vi.waitFor(
    () => {
      if (!predicate(events.flat())) {
        throw new Error('expected poll events not observed yet')
      }
    },
    { timeout: 5_000, interval: 20 }
  )
  return events.flat()
}

describe('worktree base directory poller', () => {
  const cleanups: (() => Promise<void>)[] = []

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  })

  async function makeRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'orca-base-poller-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    return root
  }

  it('emits a .git marker create and a worktree delete for flat layouts', async () => {
    const root = await makeRoot()
    const received: WorktreeBasePollEvent[][] = []
    const target = makeTarget('base', root)
    const poller = await startWorktreeBaseDirectoryPoller(
      target,
      () => target.repos,
      (events) => received.push(events),
      POLL_MS
    )
    cleanups.push(() => poller.unsubscribe())

    const worktree = join(root, 'external-1')
    await mkdir(worktree)
    await writeFile(join(worktree, '.git'), 'gitdir: elsewhere')

    const afterCreate = await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'create' && event.path === join(worktree, '.git'))
    )
    expect(
      afterCreate.filter((event) => event.type === 'create' && event.path.endsWith('.git'))
    ).toHaveLength(1)

    await rm(worktree, { recursive: true })
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'delete' && event.path === worktree)
    )
  })

  it('emits the marker only after it appears for slow checkouts', async () => {
    const root = await makeRoot()
    const received: WorktreeBasePollEvent[][] = []
    const target = makeTarget('base', root)
    const poller = await startWorktreeBaseDirectoryPoller(
      target,
      () => target.repos,
      (events) => received.push(events),
      POLL_MS
    )
    cleanups.push(() => poller.unsubscribe())

    const worktree = join(root, 'external-2')
    await mkdir(worktree)
    // Give the poller time to observe the marker-less dir first.
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3))
    expect(received.flat()).toHaveLength(0)

    await writeFile(join(worktree, '.git'), 'gitdir: elsewhere')
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'create' && event.path === join(worktree, '.git'))
    )
  })

  it('scans nested repo containers for nested layouts', async () => {
    const root = await makeRoot()
    const received: WorktreeBasePollEvent[][] = []
    const target = makeTarget('base', root, { nestWorkspaces: true })
    const poller = await startWorktreeBaseDirectoryPoller(
      target,
      () => target.repos,
      (events) => received.push(events),
      POLL_MS
    )
    cleanups.push(() => poller.unsubscribe())

    const worktree = join(root, 'project', 'external-3')
    await mkdir(worktree, { recursive: true })
    await writeFile(join(worktree, '.git'), 'gitdir: elsewhere')

    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'create' && event.path === join(worktree, '.git'))
    )
  })

  it('reports git-common worktrees metadata adds, updates, and removals', async () => {
    const commonDir = await makeRoot()
    const received: WorktreeBasePollEvent[][] = []
    const target = makeTarget('git-common', commonDir)
    const poller = await startWorktreeBaseDirectoryPoller(
      target,
      () => target.repos,
      (events) => received.push(events),
      POLL_MS
    )
    cleanups.push(() => poller.unsubscribe())

    const entry = join(commonDir, 'worktrees', 'external-4')
    await mkdir(entry, { recursive: true })
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'create' && event.path === entry)
    )

    // HEAD/gitdir metadata writes land as new files in the entry dir, which
    // bumps the entry dir mtime the poller compares.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await writeFile(join(entry, 'HEAD'), 'ref: refs/heads/main')
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'update' && event.path === entry)
    )

    await rm(entry, { recursive: true })
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'delete' && event.path === entry)
    )
  })

  it('emits deletes for all known worktrees when the root vanishes', async () => {
    const root = await makeRoot()
    const worktree = join(root, 'external-5')
    await mkdir(worktree)
    await writeFile(join(worktree, '.git'), 'gitdir: elsewhere')

    const received: WorktreeBasePollEvent[][] = []
    const target = makeTarget('base', root)
    const poller = await startWorktreeBaseDirectoryPoller(
      target,
      () => target.repos,
      (events) => received.push(events),
      POLL_MS
    )
    cleanups.push(() => poller.unsubscribe())

    await rm(root, { recursive: true, force: true })
    await waitForEvents(received, (flat) =>
      flat.some((event) => event.type === 'delete' && event.path === worktree)
    )
  })
})
