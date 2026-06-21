import { useMemo } from 'react'
import type { MobileGroupMode, MobileSortMode } from './workspace-view-settings'
import {
  buildSections,
  type FilterState,
  type Section,
  type Worktree
} from './workspace-list-sections'
import { repoColor } from './repo-color'

const ALL_EXECUTION_HOSTS_SCOPE = 'all'
const LOCAL_EXECUTION_HOST_ID = 'local'

type ExecutionHostId = typeof LOCAL_EXECUTION_HOST_ID | `ssh:${string}` | `runtime:${string}`

export type WorkspaceSectionRepo = {
  name: string
  id: string
  color: string
}

export type RepoSectionSummary = {
  id: string
  displayName: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  badgeColor?: string
}

function getVisibleHostIds(args: {
  workspaceHostScope?: string
  visibleWorkspaceHostIds?: string[] | null
}): Set<ExecutionHostId> | null {
  const explicit = args.visibleWorkspaceHostIds
    ?.map((id) => normalizeExecutionHostId(id))
    .filter((id): id is ExecutionHostId => id != null)
  if (explicit && explicit.length > 0) {
    return new Set(explicit)
  }
  const scope = args.workspaceHostScope ?? ALL_EXECUTION_HOSTS_SCOPE
  if (scope === ALL_EXECUTION_HOSTS_SCOPE) {
    return null
  }
  const normalized = normalizeExecutionHostId(scope)
  return normalized ? new Set([normalized]) : null
}

function normalizeExecutionHostId(value: string | null | undefined): ExecutionHostId | null {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }
  if (
    normalized === LOCAL_EXECUTION_HOST_ID ||
    normalized.startsWith('ssh:') ||
    normalized.startsWith('runtime:')
  ) {
    return normalized as ExecutionHostId
  }
  return null
}

function getRepoExecutionHostId(
  repo: Pick<RepoSectionSummary, 'connectionId' | 'executionHostId'>
): ExecutionHostId {
  const executionHostId = normalizeExecutionHostId(repo.executionHostId)
  if (executionHostId) {
    return executionHostId
  }
  const connectionId = repo.connectionId?.trim()
  return connectionId
    ? (`ssh:${encodeURIComponent(connectionId)}` as ExecutionHostId)
    : LOCAL_EXECUTION_HOST_ID
}

export function getVisibleRepoIdsByName(args: {
  repos: RepoSectionSummary[]
  workspaceHostScope?: string
  visibleWorkspaceHostIds?: string[] | null
}): Map<string, string> {
  const visibleHostIds = getVisibleHostIds(args)
  const entries = args.repos
    .filter((repo) => {
      if (!visibleHostIds) {
        return true
      }
      const hostId =
        repo.connectionId || repo.executionHostId
          ? getRepoExecutionHostId(repo)
          : LOCAL_EXECUTION_HOST_ID
      return visibleHostIds.has(hostId)
    })
    .map((repo) => [repo.displayName, repo.id] as const)
  return new Map(entries)
}

export function useWorkspaceSections(args: {
  displayWorktrees: Worktree[]
  sortMode: MobileSortMode
  filters: FilterState
  search: string
  groupMode: MobileGroupMode
  pinnedIds: Set<string>
  repoIdsByName: Map<string, string>
  repoSummaries: RepoSectionSummary[]
  repoColorsByName: Map<string, string>
  collapsedGroups: Set<string>
  workspaceHostScope?: string
  visibleWorkspaceHostIds?: string[] | null
}): {
  sections: Section[]
  rawSections: Section[]
  uniqueRepos: WorkspaceSectionRepo[]
  uniqueRepoColors: Map<string, string>
} {
  const {
    displayWorktrees,
    sortMode,
    filters,
    search,
    groupMode,
    pinnedIds,
    repoIdsByName,
    repoSummaries,
    repoColorsByName,
    collapsedGroups,
    workspaceHostScope,
    visibleWorkspaceHostIds
  } = args

  const uniqueRepos = useMemo(() => {
    const repos = new Map<string, { id: string; color: string }>()
    for (const w of displayWorktrees) {
      if (!repos.has(w.repo)) {
        repos.set(w.repo, {
          id: repoIdsByName.get(w.repo) ?? w.repoId,
          color: repoColorsByName.get(w.repo) ?? repoColor(w.repo)
        })
      }
    }
    return [...repos.entries()].map(([name, { id, color }]) => ({ name, id, color }))
  }, [displayWorktrees, repoColorsByName, repoIdsByName])

  const visibleRepoIdsByName = useMemo(() => {
    return getVisibleRepoIdsByName({
      repos: repoSummaries,
      workspaceHostScope,
      visibleWorkspaceHostIds
    })
  }, [repoSummaries, visibleWorkspaceHostIds, workspaceHostScope])

  const uniqueRepoColors = useMemo(
    () => new Map(uniqueRepos.map((repo) => [repo.name, repo.color])),
    [uniqueRepos]
  )

  const rawSections = useMemo(
    () =>
      buildSections(
        displayWorktrees,
        sortMode,
        filters,
        search,
        groupMode,
        pinnedIds,
        visibleRepoIdsByName
      ),
    [displayWorktrees, sortMode, filters, search, groupMode, pinnedIds, visibleRepoIdsByName]
  )

  const sections = useMemo(
    () =>
      rawSections.map((s) => ({
        ...s,
        data: collapsedGroups.has(s.title) ? [] : s.data
      })),
    [rawSections, collapsedGroups]
  )

  return { sections, rawSections, uniqueRepos, uniqueRepoColors }
}
