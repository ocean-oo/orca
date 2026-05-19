import { beforeEach, describe, expect, it, vi } from 'vitest'

const revealWorktreeInSidebar = vi.fn()

const baseState: {
  activeWorktreeId: string | null
  revealWorktreeInSidebar: typeof revealWorktreeInSidebar
  worktreesByRepo: Record<string, ({ id: string; repoId: string } & Record<string, unknown>)[]>
} = {
  activeWorktreeId: 'wt-1',
  revealWorktreeInSidebar,
  worktreesByRepo: {
    'repo-1': [
      {
        id: 'wt-1',
        repoId: 'repo-1',
        path: '/repo/worktrees/one',
        displayName: 'One',
        branch: 'one',
        head: 'abc',
        isBare: false,
        isMainWorktree: false,
        comment: '',
        linkedIssue: null,
        linkedPR: null,
        linkedLinearIssue: null,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0
      }
    ]
  }
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => baseState
  }
}))

describe('reveal-sidebar-worktree', () => {
  beforeEach(() => {
    revealWorktreeInSidebar.mockReset()
    baseState.activeWorktreeId = 'wt-1'
  })

  it('reveals the current workspace with the requested behavior', async () => {
    const { revealCurrentSidebarWorktree } = await import('./reveal-sidebar-worktree')

    expect(revealCurrentSidebarWorktree({ behavior: 'smooth' })).toBe(true)

    expect(revealWorktreeInSidebar).toHaveBeenCalledWith('wt-1', { behavior: 'smooth' })
  })

  it('can reveal a specific workspace without changing other sidebar state', async () => {
    const { revealSidebarWorktree } = await import('./reveal-sidebar-worktree')

    expect(revealSidebarWorktree('wt-1', { behavior: 'auto' })).toBe(true)

    expect(revealWorktreeInSidebar).toHaveBeenCalledWith('wt-1', { behavior: 'auto' })
  })

  it('does not reveal a missing workspace', async () => {
    const { revealSidebarWorktree } = await import('./reveal-sidebar-worktree')

    expect(revealSidebarWorktree('missing', { behavior: 'auto' })).toBe(false)

    expect(revealWorktreeInSidebar).not.toHaveBeenCalled()
  })

  it('does nothing when there is no active workspace', async () => {
    const { revealCurrentSidebarWorktree } = await import('./reveal-sidebar-worktree')

    baseState.activeWorktreeId = null
    expect(revealCurrentSidebarWorktree({ behavior: 'smooth' })).toBe(false)

    expect(revealWorktreeInSidebar).not.toHaveBeenCalled()
  })
})
