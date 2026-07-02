// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeTitleInlineRename } from './WorktreeTitleInlineRename'

describe('WorktreeTitleInlineRename lifecycle', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    root = null
    container?.remove()
    container = null
  })

  it('reports editing=false if it unmounts while renaming', () => {
    const onEditingChange = vi.fn()
    container = document.createElement('div')
    root = createRoot(container)

    act(() => {
      root?.render(
        <WorktreeTitleInlineRename
          displayName="Feature workspace"
          onEditingChange={onEditingChange}
          onRename={vi.fn()}
        />
      )
    })

    const title = container.querySelector('[data-worktree-title-inline-rename]')

    act(() => {
      title?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })

    expect(onEditingChange).toHaveBeenLastCalledWith(true)

    act(() => {
      root?.unmount()
      root = null
    })

    expect(onEditingChange).toHaveBeenLastCalledWith(false)
    expect(onEditingChange).toHaveBeenCalledTimes(2)
  })

  it('selects the full title on focus by default', () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const setSelectionRange = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange')
    const nextContainer = document.createElement('div')
    container = nextContainer
    root = createRoot(nextContainer)

    act(() => {
      root?.render(<WorktreeTitleInlineRename displayName="Feature workspace" onRename={vi.fn()} />)
    })

    act(() => {
      nextContainer
        .querySelector('[data-worktree-title-inline-rename]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })

    expect(select).toHaveBeenCalledTimes(1)
    expect(setSelectionRange).not.toHaveBeenCalled()

    select.mockRestore()
    setSelectionRange.mockRestore()
  })

  it('places the caret at the end when selectOnFocus is false', () => {
    const displayName = 'Feature workspace'
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const setSelectionRange = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange')
    const nextContainer = document.createElement('div')
    container = nextContainer
    root = createRoot(nextContainer)

    act(() => {
      root?.render(
        <WorktreeTitleInlineRename
          displayName={displayName}
          selectOnFocus={false}
          onRename={vi.fn()}
        />
      )
    })

    act(() => {
      nextContainer
        .querySelector('[data-worktree-title-inline-rename]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })

    expect(select).not.toHaveBeenCalled()
    expect(setSelectionRange).toHaveBeenCalledWith(displayName.length, displayName.length)

    select.mockRestore()
    setSelectionRange.mockRestore()
  })

  it('suppresses mouse selection in hovercard field mode', () => {
    const nextContainer = document.createElement('div')
    container = nextContainer
    root = createRoot(nextContainer)

    act(() => {
      root?.render(
        <WorktreeTitleInlineRename
          displayName="Feature workspace"
          editingPresentation="field"
          selectOnFocus={false}
          onRename={vi.fn()}
        />
      )
    })

    act(() => {
      nextContainer
        .querySelector('[data-worktree-title-inline-rename]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })

    const input = nextContainer.querySelector('[data-worktree-title-rename-input]')
    expect(input?.className).toContain('select-none')
    expect(input?.className).not.toContain('select-text')
  })

  it('keeps the hovercard field input mounted while entering edit mode', () => {
    const nextContainer = document.createElement('div')
    container = nextContainer
    root = createRoot(nextContainer)

    act(() => {
      root?.render(
        <WorktreeTitleInlineRename
          displayName="Feature workspace"
          editingPresentation="field"
          selectOnFocus={false}
          onRename={vi.fn()}
        />
      )
    })

    const readInput = nextContainer.querySelector('input')
    expect(readInput?.readOnly).toBe(true)
    expect(readInput?.getAttribute('data-worktree-title-rename-input')).toBeNull()

    act(() => {
      nextContainer
        .querySelector('[data-worktree-title-inline-rename]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })

    const editingInput = nextContainer.querySelector('[data-worktree-title-rename-input]')
    expect(editingInput).toBe(readInput)
    expect((editingInput as HTMLInputElement | null)?.readOnly).toBe(false)

    act(() => {
      root?.unmount()
      root = null
    })
  })
})
