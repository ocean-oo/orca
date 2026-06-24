import type { AppState } from '@/store/types'
import { resolveWorktreeStatus } from '@/lib/worktree-status'
import type {
  ProjectGroup,
  Repo,
  TerminalPaneLayoutNode,
  TerminalTab,
  Worktree,
  WorkspaceStatusDefinition
} from '../../../../shared/types'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  getGroupKeysForWorktree,
  getPinnedWorktreeDisplayPolicy,
  type ProjectGroupingModel,
  type WorktreeGroupBy,
  type PinnedWorktreeDisplayPolicy,
  PINNED_GROUP_KEY
} from './worktree-list-groups'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree
} from './worktree-card-status-inputs'
import { selectWorktreeAgentActivitySummary } from './worktree-agent-activity-summary'
import type { BrowserActivityTab } from './visible-worktree-activity-inputs'

export type WorktreeSectionActivityState = Pick<
  AppState,
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'agentStatusEpoch'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'retainedAgentsByPaneKey'
  | 'runtimeAgentOrchestrationByPaneKey'
> & {
  tabsByWorktree: Record<string, readonly Pick<TerminalTab, 'id' | 'title'>[]>
  browserTabsByWorktree: Record<string, readonly BrowserActivityTab[]>
  terminalLayoutRootsByTabId: Record<string, TerminalPaneLayoutNode | null | undefined>
}

export type WorktreeSectionActivitySummary = {
  runningCount: number
  hostRunningCounts?: ReadonlyMap<ExecutionHostId, number>
}

export const EMPTY_WORKTREE_SECTION_ACTIVITY: WorktreeSectionActivitySummary = {
  runningCount: 0
}

export function buildWorktreeSectionActivitySummaries({
  groupBy,
  worktrees,
  repoMap,
  prCache,
  workspaceStatuses,
  settings,
  projectGroups,
  projectGrouping,
  pinnedDisplayPolicy = getPinnedWorktreeDisplayPolicy(settings),
  defaultHostId = LOCAL_EXECUTION_HOST_ID,
  state
}: {
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  prCache: Record<string, unknown> | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings?: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  pinnedDisplayPolicy?: PinnedWorktreeDisplayPolicy
  defaultHostId?: ExecutionHostId
  state: WorktreeSectionActivityState
}): Map<string, WorktreeSectionActivitySummary> {
  const summaries = new Map<string, WorktreeSectionActivitySummary>()

  for (const worktree of worktrees) {
    const naturalGroupKeys = getGroupKeysForWorktree(
      groupBy,
      worktree,
      repoMap,
      prCache,
      workspaceStatuses,
      settings,
      projectGroups,
      projectGrouping
    )
    const groupKeys =
      worktree.isPinned && pinnedDisplayPolicy === 'single-location'
        ? [PINNED_GROUP_KEY]
        : worktree.isPinned
          ? [PINNED_GROUP_KEY, ...naturalGroupKeys]
          : naturalGroupKeys
    if (groupKeys.length === 0) {
      continue
    }

    const status = getSectionWorktreeStatus(state, worktree.id)
    for (const groupKey of groupKeys) {
      const summary = summaries.get(groupKey) ?? { ...EMPTY_WORKTREE_SECTION_ACTIVITY }
      if (status === 'working') {
        summary.runningCount++
        const hostRunningCounts = new Map(summary.hostRunningCounts ?? [])
        const hostId = getWorktreeHostId(worktree, repoMap, defaultHostId)
        hostRunningCounts.set(hostId, (hostRunningCounts.get(hostId) ?? 0) + 1)
        summary.hostRunningCounts = hostRunningCounts
      }
      summaries.set(groupKey, summary)
    }
  }

  return summaries
}

function getWorktreeHostId(
  worktree: Worktree,
  repoMap: ReadonlyMap<string, Repo>,
  defaultHostId: ExecutionHostId
): ExecutionHostId {
  const repo = repoMap.get(worktree.repoId)
  // Why: pinned headers can be cloned inside host sections, so hidden pinned
  // activity must stay attributed to the owning host instead of the global key.
  if (repo?.connectionId || repo?.executionHostId) {
    return getRepoExecutionHostId(repo)
  }
  return defaultHostId
}

function getSectionWorktreeStatus(
  state: WorktreeSectionActivityState,
  worktreeId: string
): ReturnType<typeof resolveWorktreeStatus> {
  const agentSummary = selectWorktreeAgentActivitySummary(state, worktreeId)

  // Why: collapsed headers must mirror the card dot semantics exactly; otherwise
  // a hidden section can advertise different activity than its visible cards.
  return resolveWorktreeStatus({
    tabs: state.tabsByWorktree[worktreeId] ?? [],
    browserTabs: state.browserTabsByWorktree[worktreeId] ?? [],
    ptyIdsByTabId: selectLivePtyIdsForWorktree(state, worktreeId),
    runtimePaneTitlesByTabId: selectRuntimePaneTitlesForWorktree(state, worktreeId),
    agentStatusPaneIdsByTabId: agentSummary.agentStatusPaneIdsByTabId,
    terminalLayoutRootsByTabId: state.terminalLayoutRootsByTabId,
    hasPermission: agentSummary.hasPermission,
    hasLiveWorking: agentSummary.hasLiveWorking,
    hasLiveDone: agentSummary.hasLiveDone,
    hasRetainedDone: agentSummary.hasRetainedDone
  })
}
