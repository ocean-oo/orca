// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorktreeTitleInlineRename } from './WorktreeTitleInlineRename'

describe('WorktreeTitleInlineRename lifecycle', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
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
})
