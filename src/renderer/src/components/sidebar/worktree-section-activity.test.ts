import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type {
  Project,
  ProjectGroup,
  ProjectHostSetup,
  Repo,
  TerminalTab,
  Worktree
} from '../../../../shared/types'
import {
  getProjectGroupHeaderKey,
  PINNED_GROUP_KEY,
  type PinnedWorktreeDisplayPolicy,
  type ProjectGroupingModel,
  type WorktreeGroupBy
} from './worktree-list-groups'
import {
  buildWorktreeSectionActivitySummaries,
  type WorktreeSectionActivityState
} from './worktree-section-activity'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/tmp/repo-1',
    displayName: 'repo',
    badgeColor: '#000000',
    addedAt: 0,
    ...overrides
  }
}

function makeProjectGroup(overrides: Partial<ProjectGroup>): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Group',
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'wt-1',
    repoId: 'repo-1',
    path: '/tmp/repo-1-feature',
    branch: 'refs/heads/feature',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    comment: '',
    displayName: 'feature',
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function makeTerminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'zsh',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...overrides
  }
}

function makeState(
  overrides: Partial<WorktreeSectionActivityState> = {}
): WorktreeSectionActivityState {
  return {
    tabsByWorktree: {},
    browserTabsByWorktree: {},
    ptyIdsByTabId: {},
    runtimePaneTitlesByTabId: {},
    terminalLayoutRootsByTabId: {},
    agentStatusEpoch: 0,
    agentStatusByPaneKey: {},
    migrationUnsupportedByPtyId: {},
    retainedAgentsByPaneKey: {},
    runtimeAgentOrchestrationByPaneKey: {},
    ...overrides
  }
}

function buildSummaries({
  groupBy = 'repo',
  worktrees,
  repos,
  projectGroups = [],
  projectGrouping,
  pinnedDisplayPolicy,
  defaultHostId,
  state
}: {
  groupBy?: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repos: readonly Repo[]
  projectGroups?: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  pinnedDisplayPolicy?: PinnedWorktreeDisplayPolicy
  defaultHostId?: Parameters<typeof buildWorktreeSectionActivitySummaries>[0]['defaultHostId']
  state: WorktreeSectionActivityState
}) {
  return buildWorktreeSectionActivitySummaries({
    groupBy,
    worktrees,
    repoMap: new Map(repos.map((repo) => [repo.id, repo])),
    prCache: null,
    workspaceStatuses: [],
    projectGroups,
    projectGrouping,
    pinnedDisplayPolicy,
    defaultHostId,
    state
  })
}

describe('buildWorktreeSectionActivitySummaries', () => {
  it('counts running worktrees across repo project-group ancestors', () => {
    const parent = makeProjectGroup({ id: 'parent', name: 'Parent' })
    const child = makeProjectGroup({
      id: 'child',
      name: 'Child',
      parentGroupId: parent.id
    })
    const repo = makeRepo({ projectGroupId: child.id })
    const worktree = makeWorktree({ repoId: repo.id })
    const state = makeState({
      tabsByWorktree: {
        [worktree.id]: [
          makeTerminalTab({ id: 'tab-1', worktreeId: worktree.id, title: 'Codex working' })
        ]
      },
      ptyIdsByTabId: {
        'tab-1': ['pty-1']
      }
    })

    const summaries = buildSummaries({
      worktrees: [worktree],
      repos: [repo],
      projectGroups: [parent, child],
      state
    })

    expect(summaries.get(getProjectGroupHeaderKey(parent.id))).toEqual({
      runningCount: 1,
      hostRunningCounts: new Map([['local', 1]])
    })
    expect(summaries.get(getProjectGroupHeaderKey(child.id))).toEqual({
      runningCount: 1,
      hostRunningCounts: new Map([['local', 1]])
    })
    expect(summaries.get(`repo:${repo.id}`)).toEqual({
      runningCount: 1,
      hostRunningCounts: new Map([['local', 1]])
    })
  })

  it('counts pinned workspace activity only on the pinned header', () => {
    const repo = makeRepo({ projectGroupId: 'group-1' })
    const worktree = makeWorktree({ repoId: repo.id, isPinned: true })
    const now = Date.now()
    const entry: AgentStatusEntry = {
      state: 'working',
      prompt: '',
      updatedAt: now,
      stateStartedAt: now,
      paneKey: makePaneKey('tab-1', LEAF_ID),
      stateHistory: []
    }
    const state = makeState({
      tabsByWorktree: {
        [worktree.id]: [makeTerminalTab({ id: 'tab-1', worktreeId: worktree.id })]
      },
      agentStatusEpoch: 1,
      agentStatusByPaneKey: {
        [entry.paneKey]: entry
      }
    })

    const summaries = buildSummaries({
      worktrees: [worktree],
      repos: [repo],
      projectGroups: [makeProjectGroup({ id: 'group-1' })],
      state
    })

    const pinnedSummary = summaries.get(PINNED_GROUP_KEY)
    expect(pinnedSummary?.runningCount).toBe(1)
    expect(pinnedSummary?.hostRunningCounts).toEqual(new Map([['local', 1]]))
    expect(summaries.get(`repo:${repo.id}`)).toBeUndefined()
    expect(summaries.get(getProjectGroupHeaderKey('group-1'))).toBeUndefined()
  })

  it('counts pinned activity in natural groups when duplicate display is enabled', () => {
    const repo = makeRepo({ projectGroupId: 'group-1' })
    const worktree = makeWorktree({ repoId: repo.id, isPinned: true })
    const now = Date.now()
    const entry: AgentStatusEntry = {
      state: 'working',
      prompt: '',
      updatedAt: now,
      stateStartedAt: now,
      paneKey: makePaneKey('tab-1', LEAF_ID),
      stateHistory: []
    }
    const state = makeState({
      tabsByWorktree: {
        [worktree.id]: [makeTerminalTab({ id: 'tab-1', worktreeId: worktree.id })]
      },
      agentStatusEpoch: 1,
      agentStatusByPaneKey: {
        [entry.paneKey]: entry
      }
    })

    const summaries = buildSummaries({
      worktrees: [worktree],
      repos: [repo],
      projectGroups: [makeProjectGroup({ id: 'group-1' })],
      pinnedDisplayPolicy: 'duplicate-in-groups',
      state
    })

    expect(summaries.get(PINNED_GROUP_KEY)?.runningCount).toBe(1)
    expect(summaries.get(`repo:${repo.id}`)?.runningCount).toBe(1)
    expect(summaries.get(`repo:${repo.id}`)?.hostRunningCounts).toEqual(new Map([['local', 1]]))
    expect(summaries.get(getProjectGroupHeaderKey('group-1'))?.runningCount).toBe(1)
    expect(summaries.get(getProjectGroupHeaderKey('group-1'))?.hostRunningCounts).toEqual(
      new Map([['local', 1]])
    )
  })

  it('counts duplicate-mode pinned activity on project setup headers', () => {
    const repo = makeRepo()
    const project: Project = {
      id: 'github:stablyai/orca',
      displayName: 'Orca',
      badgeColor: '#737373',
      sourceRepoIds: [repo.id],
      createdAt: 1,
      updatedAt: 1
    }
    const setup: ProjectHostSetup = {
      id: repo.id,
      projectId: project.id,
      hostId: 'local',
      repoId: repo.id,
      path: repo.path,
      displayName: repo.displayName,
      setupState: 'ready',
      setupMethod: 'legacy-repo',
      createdAt: 1,
      updatedAt: 1
    }
    const worktree = makeWorktree({ repoId: repo.id, isPinned: true })
    const state = makeState({
      tabsByWorktree: {
        [worktree.id]: [
          makeTerminalTab({ id: 'tab-1', worktreeId: worktree.id, title: 'Codex working' })
        ]
      },
      ptyIdsByTabId: {
        'tab-1': ['pty-1']
      }
    })

    const summaries = buildSummaries({
      worktrees: [worktree],
      repos: [repo],
      projectGrouping: { projects: [project], projectHostSetups: [setup] },
      pinnedDisplayPolicy: 'duplicate-in-groups',
      state
    })

    expect(summaries.get(PINNED_GROUP_KEY)?.runningCount).toBe(1)
    expect(summaries.get(`project:${project.id}`)).toEqual({
      runningCount: 1,
      hostRunningCounts: new Map([['local', 1]])
    })
    expect(summaries.get(`repo:${repo.id}`)).toBeUndefined()
  })

  it('keeps running activity attributable to owning hosts per section', () => {
    const localRepo = makeRepo({ id: 'local-repo' })
    const sshRepo = makeRepo({
      id: 'ssh-repo',
      connectionId: 'ssh-1'
    })
    const localWorktree = makeWorktree({
      id: 'local-wt',
      repoId: localRepo.id,
      isPinned: true
    })
    const sshWorktree = makeWorktree({
      id: 'ssh-wt',
      repoId: sshRepo.id,
      isPinned: true
    })
    const state = makeState({
      tabsByWorktree: {
        [localWorktree.id]: [
          makeTerminalTab({
            id: 'local-tab',
            worktreeId: localWorktree.id,
            title: 'Codex working'
          })
        ],
        [sshWorktree.id]: [
          makeTerminalTab({
            id: 'ssh-tab',
            worktreeId: sshWorktree.id,
            title: 'Codex working'
          })
        ]
      },
      ptyIdsByTabId: {
        'local-tab': ['local-pty'],
        'ssh-tab': ['ssh-pty']
      }
    })

    const summaries = buildSummaries({
      worktrees: [localWorktree, sshWorktree],
      repos: [localRepo, sshRepo],
      defaultHostId: 'local',
      state
    })

    const pinnedSummary = summaries.get(PINNED_GROUP_KEY)
    expect(pinnedSummary?.runningCount).toBe(2)
    expect(pinnedSummary?.hostRunningCounts).toEqual(
      new Map([
        ['local', 1],
        ['ssh:ssh-1', 1]
      ])
    )
    const allSummary = buildSummaries({
      groupBy: 'none',
      worktrees: [localWorktree, sshWorktree],
      repos: [localRepo, sshRepo],
      pinnedDisplayPolicy: 'duplicate-in-groups',
      defaultHostId: 'local',
      state
    }).get('all')
    expect(allSummary?.runningCount).toBe(2)
    expect(allSummary?.hostRunningCounts).toEqual(
      new Map([
        ['local', 1],
        ['ssh:ssh-1', 1]
      ])
    )
  })
})
