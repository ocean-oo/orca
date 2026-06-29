import { useCallback } from 'react'
import type { AddRepoDialogStep } from './add-repo-dialog-types'

/**
 * Orchestrates resetting the Add Project dialog's per-flow state. `resetState`
 * runs on close/back; `resetHostScopedState` runs when the selected host changes.
 */
export function useAddRepoDialogReset({
  step,
  setStep,
  setIsAdding,
  setAddProjectBusyLabel,
  resetLocalFolderFlow,
  resetServerPathFlow,
  resetCloneFlow,
  resetNestedImportFlow,
  resetNestedRepoReviewState,
  resetCreateDefaultState,
  resetCreateState,
  resetRemoteState
}: {
  step: AddRepoDialogStep
  setStep: (step: AddRepoDialogStep) => void
  setIsAdding: (isAdding: boolean) => void
  setAddProjectBusyLabel: (label: string | null) => void
  resetLocalFolderFlow: () => void
  resetServerPathFlow: () => void
  resetCloneFlow: () => void
  resetNestedImportFlow: () => void
  resetNestedRepoReviewState: () => void
  resetCreateDefaultState: () => void
  resetCreateState: () => void
  resetRemoteState: () => void
}): { resetState: () => void; resetHostScopedState: () => void } {
  const resetState = useCallback(() => {
    // Why: kill the git clone process if one is running, so backing out
    // or closing the dialog doesn't leave a clone running on disk.
    void window.api.repos.cloneAbort()
    resetLocalFolderFlow()
    setStep('add')
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    resetNestedImportFlow()
    resetNestedRepoReviewState()
    resetCreateDefaultState()
    resetCreateState()
    resetRemoteState()
  }, [
    resetCloneFlow,
    resetLocalFolderFlow,
    resetNestedRepoReviewState,
    resetCreateDefaultState,
    resetServerPathFlow,
    resetNestedImportFlow,
    resetRemoteState,
    resetCreateState,
    setAddProjectBusyLabel,
    setIsAdding,
    setStep
  ])

  const resetHostScopedState = useCallback(() => {
    setIsAdding(false)
    setAddProjectBusyLabel(null)
    resetServerPathFlow()
    resetCloneFlow()
    // Why: a nested scan/review is tied to the host that produced it. On a host
    // switch, clear it so import / open-as-folder can't target the new host with
    // the old host's paths, and leave the stranded nested step for the start step.
    resetNestedImportFlow()
    resetNestedRepoReviewState()
    if (step === 'nested') {
      setStep('add')
    }
    resetCreateDefaultState()
    resetCreateState()
    resetRemoteState()
  }, [
    resetCloneFlow,
    resetCreateDefaultState,
    resetCreateState,
    resetNestedImportFlow,
    resetNestedRepoReviewState,
    resetRemoteState,
    resetServerPathFlow,
    setAddProjectBusyLabel,
    setIsAdding,
    setStep,
    step
  ])

  return { resetState, resetHostScopedState }
}
