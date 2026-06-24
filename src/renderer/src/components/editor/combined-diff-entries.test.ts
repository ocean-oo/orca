import { describe, expect, it } from 'vitest'
import {
  getCombinedBranchEntries,
  getCombinedUncommittedEntries,
  resolveCombinedUncommittedSnapshotEntries,
  shouldAutoReloadCombinedDiffFromGitStatus
} from './combined-diff-entries'
import type { GitBranchChangeEntry, GitStatusEntry } from '../../../../shared/types'

describe('getCombinedUncommittedEntries', () => {
  it('filters unresolved conflicts from live entries', () => {
    const liveEntries: GitStatusEntry[] = [
      {
        path: 'src/conflict.ts',
        status: 'modified',
        area: 'unstaged',
        conflictStatus: 'unresolved'
      },
      { path: 'src/ok.ts', status: 'modified', area: 'unstaged' }
    ]

    expect(getCombinedUncommittedEntries(liveEntries, undefined)).toEqual([
      { path: 'src/ok.ts', status: 'modified', area: 'unstaged' }
    ])
  })

  it('applies area filter when provided', () => {
    const liveEntries: GitStatusEntry[] = [
      { path: 'src/staged.ts', status: 'modified', area: 'staged' },
      { path: 'src/unstaged.ts', status: 'modified', area: 'unstaged' },
      { path: 'src/untracked.ts', status: 'untracked', area: 'untracked' }
    ]

    expect(getCombinedUncommittedEntries(liveEntries, 'staged')).toEqual([
      { path: 'src/staged.ts', status: 'modified', area: 'staged' }
    ])
  })

  it('includes every area when no area filter is set', () => {
    const liveEntries: GitStatusEntry[] = [
      { path: 'src/staged.ts', status: 'modified', area: 'staged' },
      { path: 'src/unstaged.ts', status: 'modified', area: 'unstaged' },
      { path: 'src/untracked.ts', status: 'untracked', area: 'untracked' }
    ]

    expect(getCombinedUncommittedEntries(liveEntries, undefined)).toEqual([
      { path: 'src/staged.ts', status: 'modified', area: 'staged' },
      { path: 'src/unstaged.ts', status: 'modified', area: 'unstaged' },
      { path: 'src/untracked.ts', status: 'untracked', area: 'untracked' }
    ])
  })
})

describe('resolveCombinedUncommittedSnapshotEntries', () => {
  it('uses the live staged area when a snapshot unstaged file has been staged', () => {
    const snapshotEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'unstaged', added: 2, removed: 1 }
    ]
    const liveEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'staged', added: 2, removed: 1 }
    ]

    expect(resolveCombinedUncommittedSnapshotEntries(snapshotEntries, liveEntries)).toEqual([
      { path: 'src/file.ts', status: 'modified', area: 'staged', added: 2, removed: 1 }
    ])
  })

  it('uses the live unstaged area when a snapshot staged file has been unstaged', () => {
    const snapshotEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'staged' }
    ]
    const liveEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'unstaged' }
    ]

    expect(resolveCombinedUncommittedSnapshotEntries(snapshotEntries, liveEntries)).toEqual([
      { path: 'src/file.ts', status: 'modified', area: 'unstaged' }
    ])
  })

  it('keeps the snapshot area when that area is still present for a path', () => {
    const snapshotEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'unstaged' }
    ]
    const liveEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'staged' },
      { path: 'src/file.ts', status: 'modified', area: 'unstaged' }
    ]

    expect(resolveCombinedUncommittedSnapshotEntries(snapshotEntries, liveEntries)).toEqual(
      snapshotEntries
    )
  })

  it('keeps a retained resolved area when live status no longer includes the path', () => {
    const snapshotEntries: GitStatusEntry[] = [
      { path: 'src/file.ts', status: 'modified', area: 'unstaged' }
    ]
    const retained = new Map<string, GitStatusEntry>([
      ['src/file.ts', { path: 'src/file.ts', status: 'modified', area: 'staged' }]
    ])

    expect(resolveCombinedUncommittedSnapshotEntries(snapshotEntries, [], retained)).toEqual([
      { path: 'src/file.ts', status: 'modified', area: 'staged' }
    ])
  })
})

describe('getCombinedBranchEntries', () => {
  it('uses an explicitly empty snapshot instead of falling back to live entries', () => {
    const liveEntries: GitBranchChangeEntry[] = [{ path: 'src/live.ts', status: 'modified' }]

    expect(getCombinedBranchEntries([], liveEntries)).toEqual([])
  })

  it('falls back to live entries when no snapshot exists', () => {
    const liveEntries: GitBranchChangeEntry[] = [{ path: 'src/live.ts', status: 'modified' }]

    expect(getCombinedBranchEntries(undefined, liveEntries)).toEqual(liveEntries)
  })
})

describe('shouldAutoReloadCombinedDiffFromGitStatus', () => {
  it('does not auto-reload snapshot-backed uncommitted diffs', () => {
    expect(
      shouldAutoReloadCombinedDiffFromGitStatus({
        mode: 'uncommitted',
        hasUncommittedEntriesSnapshot: true
      })
    ).toBe(false)
  })

  it('keeps the legacy live-entry uncommitted path reloadable', () => {
    expect(
      shouldAutoReloadCombinedDiffFromGitStatus({
        mode: 'uncommitted',
        hasUncommittedEntriesSnapshot: false
      })
    ).toBe(true)
  })

  it('does not use git status to reload branch or commit combined diffs', () => {
    expect(
      shouldAutoReloadCombinedDiffFromGitStatus({
        mode: 'branch',
        hasUncommittedEntriesSnapshot: false
      })
    ).toBe(false)
    expect(
      shouldAutoReloadCombinedDiffFromGitStatus({
        mode: 'commit',
        hasUncommittedEntriesSnapshot: false
      })
    ).toBe(false)
  })
})
