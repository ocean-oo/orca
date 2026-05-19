import { describe, expect, it } from 'vitest'
import {
  resolvePendingSidebarReveal,
  shouldAdjustWorktreeSidebarMeasuredRowScroll,
  shouldQueueStartupSidebarReveal
} from './WorktreeList'

describe('shouldAdjustWorktreeSidebarMeasuredRowScroll', () => {
  it('suppresses measured-row scroll correction while TanStack is scrolling', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: true,
        now: 1_000,
        suppressUntil: 0
      })
    ).toBe(false)
  })

  it('suppresses measured-row scroll correction during direct scroll input grace period', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: false,
        now: 1_000,
        suppressUntil: 1_250
      })
    ).toBe(false)
  })

  it('allows measured-row scroll correction after direct scrolling settles', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: false,
        now: 1_500,
        suppressUntil: 1_250
      })
    ).toBe(true)
  })

  it('queues a startup reveal once the active workspace and rows are ready', () => {
    expect(
      shouldQueueStartupSidebarReveal({
        hasQueuedStartupReveal: false,
        workspaceSessionReady: true,
        persistedUIReady: true,
        activeWorktreeId: 'wt-1',
        pendingRevealWorktree: null,
        renderRowCount: 3
      })
    ).toBe(true)
  })

  it('does not queue a startup reveal when another reveal is already pending', () => {
    expect(
      shouldQueueStartupSidebarReveal({
        hasQueuedStartupReveal: false,
        workspaceSessionReady: true,
        persistedUIReady: true,
        activeWorktreeId: 'wt-1',
        pendingRevealWorktree: { worktreeId: 'wt-2', behavior: 'smooth' },
        renderRowCount: 3
      })
    ).toBe(false)
  })

  it('does not queue a startup reveal twice', () => {
    expect(
      shouldQueueStartupSidebarReveal({
        hasQueuedStartupReveal: true,
        workspaceSessionReady: true,
        persistedUIReady: true,
        activeWorktreeId: 'wt-1',
        pendingRevealWorktree: null,
        renderRowCount: 3
      })
    ).toBe(false)
  })

  it('does not queue a startup reveal before hydration is ready', () => {
    expect(
      shouldQueueStartupSidebarReveal({
        hasQueuedStartupReveal: false,
        workspaceSessionReady: false,
        persistedUIReady: true,
        activeWorktreeId: 'wt-1',
        pendingRevealWorktree: null,
        renderRowCount: 3
      })
    ).toBe(false)
  })

  it('keeps pending reveal requests when the worktree still exists but the row is unresolved', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: -1,
        targetWorktreeStillExists: true
      })
    ).toBe('keep-pending')
  })

  it('clears pending reveal requests once the target disappears', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: -1,
        targetWorktreeStillExists: false
      })
    ).toBe('clear')
  })

  it('scrolls and clears once the target row is resolvable', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: 4,
        targetWorktreeStillExists: true
      })
    ).toBe('scroll-and-clear')
  })
})
