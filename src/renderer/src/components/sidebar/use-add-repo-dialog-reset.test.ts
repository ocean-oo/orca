// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddRepoDialogReset } from './use-add-repo-dialog-reset'
import type { AddRepoDialogStep } from './add-repo-dialog-types'

vi.stubGlobal(
  'window',
  Object.assign(globalThis.window ?? {}, {
    api: { repos: { cloneAbort: vi.fn() } }
  })
)

type ResetApi = ReturnType<typeof useAddRepoDialogReset>

function makeMocks() {
  return {
    setStep: vi.fn(),
    setIsAdding: vi.fn(),
    setAddProjectBusyLabel: vi.fn(),
    resetLocalFolderFlow: vi.fn(),
    resetServerPathFlow: vi.fn(),
    resetCloneFlow: vi.fn(),
    resetNestedImportFlow: vi.fn(),
    resetNestedRepoReviewState: vi.fn(),
    resetCreateDefaultState: vi.fn(),
    resetCreateState: vi.fn(),
    resetRemoteState: vi.fn()
  }
}

const roots: Root[] = []
let latest: ResetApi | null = null

function renderReset(step: AddRepoDialogStep, mocks: ReturnType<typeof makeMocks>): void {
  function Probe(): null {
    latest = useAddRepoDialogReset({ step, ...mocks })
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(createElement(Probe))
  })
}

describe('useAddRepoDialogReset', () => {
  beforeEach(() => {
    latest = null
  })

  afterEach(() => {
    act(() => {
      while (roots.length) {
        roots.pop()?.unmount()
      }
    })
  })

  it('resetHostScopedState clears nested review state so it cannot bind to the new host', () => {
    const mocks = makeMocks()
    renderReset('nested', mocks)

    act(() => {
      latest?.resetHostScopedState()
    })

    expect(mocks.resetNestedImportFlow).toHaveBeenCalledTimes(1)
    expect(mocks.resetNestedRepoReviewState).toHaveBeenCalledTimes(1)
    // Why: a stranded nested step must return to the start step after a host switch.
    expect(mocks.setStep).toHaveBeenCalledWith('add')
  })

  it('resetHostScopedState leaves the step alone when not on the nested step', () => {
    const mocks = makeMocks()
    renderReset('clone', mocks)

    act(() => {
      latest?.resetHostScopedState()
    })

    expect(mocks.resetNestedImportFlow).toHaveBeenCalledTimes(1)
    expect(mocks.resetNestedRepoReviewState).toHaveBeenCalledTimes(1)
    expect(mocks.setStep).not.toHaveBeenCalled()
  })

  it('resetState aborts any clone and returns to the start step', () => {
    const mocks = makeMocks()
    renderReset('nested', mocks)

    act(() => {
      latest?.resetState()
    })

    expect(window.api.repos.cloneAbort).toHaveBeenCalled()
    expect(mocks.resetNestedImportFlow).toHaveBeenCalledTimes(1)
    expect(mocks.resetNestedRepoReviewState).toHaveBeenCalledTimes(1)
    expect(mocks.setStep).toHaveBeenCalledWith('add')
  })
})
