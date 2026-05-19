import { describe, expect, it, vi } from 'vitest'
import { canRevealCurrentWorkspace, revealCurrentWorkspaceFromToolbar } from './SidebarToolbar'

describe('SidebarToolbar reveal current workspace action', () => {
  it('disables the action when there is no active workspace', () => {
    expect(canRevealCurrentWorkspace(null)).toBe(false)
  })

  it('enables the action when an active workspace exists', () => {
    expect(canRevealCurrentWorkspace('wt-1')).toBe(true)
  })

  it('uses smooth reveal behavior from the toolbar action', () => {
    const revealCurrentWorkspace = vi.fn(() => true)

    expect(revealCurrentWorkspaceFromToolbar(revealCurrentWorkspace)).toBe(true)
    expect(revealCurrentWorkspace).toHaveBeenCalledWith({ behavior: 'smooth' })
  })
})
