import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type {
  WorktreeBaseRepoWatchConfig,
  WorktreeBaseWatchTarget
} from './worktree-base-directory-event-filter'

export type WorktreeBasePollEvent = { type: 'create' | 'update' | 'delete'; path: string }

// Why: these targets used to be recursive FSEvents subscriptions spanning the
// entire workspace root (every worktree's full tree) and the repo's whole
// common .git (objects included), forcing fseventsd to deliver all of that
// churn to Orca just to observe a handful of shallow paths. A readdir/stat
// poll observes exactly those paths with zero fseventsd clients. 2s is fast
// enough for external `git worktree add/remove`; Orca's own worktree
// operations notify the renderer directly and don't rely on this signal.
export const WORKTREE_BASE_POLL_INTERVAL_MS = 2_000

type BaseSnapshot = { kind: 'base'; markers: Map<string, boolean> }
type GitCommonSnapshot = { kind: 'git-common'; mtimes: Map<string, number> }
type PollSnapshot = BaseSnapshot | GitCommonSnapshot

async function hasGitMarker(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

// Depth-1 worktree dirs (flat layout), plus depth-2 dirs under each nested
// repo's container, mirroring what worktree-base-directory-event-filter
// matches: `<wt>/.git` completion markers and `<wt>` deletions.
async function snapshotBase(
  rootPath: string,
  repos: ReadonlyMap<string, WorktreeBaseRepoWatchConfig>
): Promise<BaseSnapshot> {
  const markers = new Map<string, boolean>()
  const configs = [...repos.values()]
  const includeFlat = configs.some((config) => !config.nestWorkspaces)
  const nestedRepoNames = new Set(
    configs
      .filter((config) => config.nestWorkspaces)
      .map((config) => normalizeRuntimePathForComparison(config.repoName))
  )

  let rootEntries
  try {
    rootEntries = await readdir(rootPath, { withFileTypes: true })
  } catch {
    // Root vanished: an empty snapshot diffs into delete events for every
    // previously-known worktree dir, matching the old watcher's error path.
    return { kind: 'base', markers }
  }

  const candidates: string[] = []
  for (const entry of rootEntries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue
    }
    const entryPath = join(rootPath, entry.name)
    if (includeFlat) {
      candidates.push(entryPath)
    }
    if (nestedRepoNames.has(normalizeRuntimePathForComparison(entry.name))) {
      let subEntries
      try {
        subEntries = await readdir(entryPath, { withFileTypes: true })
      } catch {
        subEntries = []
      }
      for (const sub of subEntries) {
        if (sub.isDirectory() || sub.isSymbolicLink()) {
          candidates.push(join(entryPath, sub.name))
        }
      }
    }
  }

  for (const dir of candidates) {
    markers.set(dir, await hasGitMarker(dir))
  }
  return { kind: 'base', markers }
}

function diffBase(prev: BaseSnapshot, next: BaseSnapshot): WorktreeBasePollEvent[] {
  const events: WorktreeBasePollEvent[] = []
  for (const [dir, marker] of next.markers) {
    if (marker && prev.markers.get(dir) !== true) {
      events.push({ type: 'create', path: join(dir, '.git') })
    }
  }
  for (const dir of prev.markers.keys()) {
    if (!next.markers.has(dir)) {
      events.push({ type: 'delete', path: dir })
    }
  }
  return events
}

// `<common>/worktrees/<name>` entries. Entry-dir mtime covers the metadata
// writes the old recursive watcher reacted to (HEAD/gitdir/locked are written
// via rename into the entry dir, which bumps its mtime).
async function snapshotGitCommon(commonDirPath: string): Promise<GitCommonSnapshot> {
  const mtimes = new Map<string, number>()
  const worktreesDir = join(commonDirPath, 'worktrees')
  let entries
  try {
    entries = await readdir(worktreesDir, { withFileTypes: true })
  } catch {
    // Missing worktrees dir is normal for repos without linked worktrees.
    return { kind: 'git-common', mtimes }
  }
  for (const entry of entries) {
    const entryPath = join(worktreesDir, entry.name)
    try {
      mtimes.set(entryPath, (await stat(entryPath)).mtimeMs)
    } catch {
      // Entry removed between readdir and stat.
    }
  }
  return { kind: 'git-common', mtimes }
}

function diffGitCommon(prev: GitCommonSnapshot, next: GitCommonSnapshot): WorktreeBasePollEvent[] {
  const events: WorktreeBasePollEvent[] = []
  for (const [entryPath, mtime] of next.mtimes) {
    const prevMtime = prev.mtimes.get(entryPath)
    if (prevMtime === undefined) {
      events.push({ type: 'create', path: entryPath })
    } else if (prevMtime !== mtime) {
      events.push({ type: 'update', path: entryPath })
    }
  }
  for (const entryPath of prev.mtimes.keys()) {
    if (!next.mtimes.has(entryPath)) {
      events.push({ type: 'delete', path: entryPath })
    }
  }
  return events
}

async function takeSnapshot(
  target: WorktreeBaseWatchTarget,
  getRepos: () => ReadonlyMap<string, WorktreeBaseRepoWatchConfig>
): Promise<PollSnapshot> {
  return target.kind === 'git-common'
    ? snapshotGitCommon(target.path)
    : snapshotBase(target.path, getRepos())
}

function diffSnapshots(prev: PollSnapshot, next: PollSnapshot): WorktreeBasePollEvent[] {
  if (prev.kind === 'git-common' && next.kind === 'git-common') {
    return diffGitCommon(prev, next)
  }
  if (prev.kind === 'base' && next.kind === 'base') {
    return diffBase(prev, next)
  }
  return []
}

/** Polls the shallow paths a worktree base target cares about and synthesizes
 *  watcher-shaped events. Resolves once the baseline snapshot is taken. */
export async function startWorktreeBaseDirectoryPoller(
  target: WorktreeBaseWatchTarget,
  getRepos: () => ReadonlyMap<string, WorktreeBaseRepoWatchConfig>,
  onEvents: (events: WorktreeBasePollEvent[]) => void,
  pollIntervalMs: number = WORKTREE_BASE_POLL_INTERVAL_MS
): Promise<{ unsubscribe: () => Promise<void> }> {
  let disposed = false
  let ticking = false
  let snapshot = await takeSnapshot(target, getRepos)

  const timer = setInterval(() => {
    if (disposed || ticking) {
      return
    }
    ticking = true
    void takeSnapshot(target, getRepos)
      .then((next) => {
        if (disposed) {
          return
        }
        const events = diffSnapshots(snapshot, next)
        snapshot = next
        if (events.length > 0) {
          onEvents(events)
        }
      })
      .catch(() => {
        // Transient fs error: keep the previous snapshot and retry next tick.
      })
      .finally(() => {
        ticking = false
      })
  }, pollIntervalMs)
  timer.unref?.()

  return {
    unsubscribe: async () => {
      disposed = true
      clearInterval(timer)
    }
  }
}
