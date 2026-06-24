import type { OpenFile } from '@/store/slices/editor'
import type { GitBranchChangeEntry, GitStatusEntry } from '../../../../shared/types'
import type { CombinedDiffFileTreeMode } from './combined-diff-file-tree-model'

/**
 * Fallback filtering for combined-diff tabs that were opened before the
 * snapshot field existed. When a snapshot is present the caller should use it
 * directly (after filtering out unresolved conflicts) instead of calling this.
 */
export function getCombinedUncommittedEntries(
  liveEntries: GitStatusEntry[],
  areaFilter: OpenFile['combinedAreaFilter']
): GitStatusEntry[] {
  return liveEntries.filter((entry) => {
    if (entry.conflictStatus === 'unresolved') {
      return false
    }
    return areaFilter === undefined || entry.area === areaFilter
  })
}

export function resolveCombinedUncommittedSnapshotEntries(
  snapshotEntries: readonly GitStatusEntry[],
  liveEntries: readonly GitStatusEntry[],
  retainedResolvedEntries?: ReadonlyMap<string, GitStatusEntry>
): GitStatusEntry[] {
  const liveEntriesByPath = new Map<string, GitStatusEntry[]>()
  for (const liveEntry of liveEntries) {
    const entries = liveEntriesByPath.get(liveEntry.path)
    if (entries) {
      entries.push(liveEntry)
    } else {
      liveEntriesByPath.set(liveEntry.path, [liveEntry])
    }
  }

  return snapshotEntries.map((snapshotEntry) => {
    const livePathEntries = liveEntriesByPath.get(snapshotEntry.path) ?? []
    if (livePathEntries.some((liveEntry) => liveEntry.area === snapshotEntry.area)) {
      return snapshotEntry
    }

    const movedEntry = livePathEntries[0] ?? retainedResolvedEntries?.get(snapshotEntry.path)
    if (!movedEntry || movedEntry.area === snapshotEntry.area) {
      return snapshotEntry
    }

    // Why: a snapshot-backed Changes tab can outlive stage/unstage actions.
    // Load the area Git now reports so Monaco doesn't diff identical files.
    return {
      ...snapshotEntry,
      area: movedEntry.area,
      status: movedEntry.status,
      oldPath: movedEntry.oldPath,
      added: movedEntry.added,
      removed: movedEntry.removed,
      submodule: movedEntry.submodule
    }
  })
}

export function getCombinedBranchEntries(
  snapshotEntries: readonly GitBranchChangeEntry[] | undefined,
  liveEntries: readonly GitBranchChangeEntry[]
): GitBranchChangeEntry[] {
  // Why: an explicitly empty tab snapshot should stay empty instead of drifting
  // to later Source Control refreshes.
  return [...(snapshotEntries ?? liveEntries)]
}

export function shouldAutoReloadCombinedDiffFromGitStatus({
  mode,
  hasUncommittedEntriesSnapshot
}: {
  mode: CombinedDiffFileTreeMode
  hasUncommittedEntriesSnapshot: boolean
}): boolean {
  // Why: snapshot-backed tabs preserve the tab-open file list while
  // staging/commit status churns; targeted editor-write reloads still refresh.
  return mode === 'uncommitted' && !hasUncommittedEntriesSnapshot
}
