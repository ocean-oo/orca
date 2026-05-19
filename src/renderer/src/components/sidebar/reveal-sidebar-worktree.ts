import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/slices/worktree-helpers'

export function revealSidebarWorktree(
  worktreeId: string,
  options?: { behavior?: 'auto' | 'smooth' }
): boolean {
  const state = useAppStore.getState()
  const worktree = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (!worktree) {
    return false
  }

  state.revealWorktreeInSidebar(worktreeId, options)
  return true
}

export function revealCurrentSidebarWorktree(options?: { behavior?: 'auto' | 'smooth' }): boolean {
  const activeWorktreeId = useAppStore.getState().activeWorktreeId
  if (!activeWorktreeId) {
    return false
  }
  return revealSidebarWorktree(activeWorktreeId, options)
}
