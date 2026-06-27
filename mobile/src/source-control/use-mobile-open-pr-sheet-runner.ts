import { useCallback, type MutableRefObject } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { triggerError } from '../platform/haptics'
import type { MobileGitStatusResult } from './mobile-git-status'
import { getMobilePrCreateBlockMessage, type MobilePrPrefill } from './mobile-pr-create'
import {
  mobileHostedReviewCreateIntentProgressMessage,
  prepareMobileHostedReviewCreateIntent,
  type MobileHostedReviewCreateIntentOutcome
} from './mobile-hosted-review-create-intent'

type RunGitWorkflow = (actionId: string, runner: () => Promise<void>) => Promise<boolean>

type Params = {
  client: RpcClient | null
  worktreeId: string
  status: MobileGitStatusResult | null
  branchLabel: string
  commitMessage: string
  mountedRef: MutableRefObject<boolean>
  runGitWorkflow: RunGitWorkflow
  setActionError: (next: string | null) => void
  setCommitMessage: (next: string) => void
  setShowActionSheet: (next: boolean) => void
  setPrPrefill: (next: MobilePrPrefill | null) => void
  setShowPrSheet: (next: boolean) => void
}

export function useMobileOpenPrSheetRunner({
  client,
  worktreeId,
  status,
  branchLabel,
  commitMessage,
  mountedRef,
  runGitWorkflow,
  setActionError,
  setCommitMessage,
  setShowActionSheet,
  setPrPrefill,
  setShowPrSheet
}: Params) {
  return useCallback(
    async (pushFirst: boolean) => {
      setShowActionSheet(false)
      const branch = status?.branch
      if (!client || !branch) {
        triggerError()
        setActionError('Check out a branch before creating a pull request.')
        return
      }
      const prepared: { current: MobileHostedReviewCreateIntentOutcome | null } = { current: null }
      const ran = await runGitWorkflow(pushFirst ? 'push-create-pr' : 'create-pr', async () => {
        prepared.current = await prepareMobileHostedReviewCreateIntent(client, worktreeId, {
          branch,
          title: branchLabel,
          status,
          commitMessage,
          onProgress: (progress) =>
            setActionError(mobileHostedReviewCreateIntentProgressMessage(progress))
        })
        if (!prepared.current.ok) {
          throw new Error(prepared.current.error)
        }
      })
      const outcome = prepared.current
      if (!ran || !mountedRef.current || !outcome || !outcome.ok) {
        return
      }
      const prefill = outcome.prefill
      if (outcome.committed) {
        setCommitMessage('')
      }
      const blockedMessage = getMobilePrCreateBlockMessage(prefill)
      if (blockedMessage) {
        triggerError()
        setActionError(blockedMessage)
        return
      }
      setActionError(null)
      setPrPrefill(prefill)
      setShowPrSheet(true)
    },
    [
      branchLabel,
      client,
      commitMessage,
      mountedRef,
      runGitWorkflow,
      setActionError,
      setCommitMessage,
      setPrPrefill,
      setShowActionSheet,
      setShowPrSheet,
      status,
      worktreeId
    ]
  )
}
