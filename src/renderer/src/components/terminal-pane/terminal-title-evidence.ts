import { normalizeCompatibleAgentTitleForOwner } from '../../../../shared/agent-title-owner'
import type { AgentType } from '../../../../shared/agent-status-types'
import {
  resolvePaneRendererPolicy,
  type RendererPolicyDecision,
  type TerminalGpuAccelerationMode
} from './terminal-renderer-policy'

export type TerminalTitleSource = 'osc' | 'hook' | 'launch' | 'foreground-process' | 'restore'

/**
 * A single typed piece of terminal-title evidence. Consumers should read this
 * instead of re-interpreting raw title strings so display, status, identity,
 * and renderer decisions stay derived from one source with explicit provenance.
 */
export type TerminalTitleEvidence = {
  rawTitle: string | null
  displayTitle: string | null
  source: TerminalTitleSource
  observedAt: number
  tabId: string
  leafId: string | null
  ptyId: string | null
  ptyGeneration: string | null
}

/**
 * The authoritative agent owner of a pane. `source` records which evidence
 * class won; `confidence` separates authoritative ownership (hook/process/
 * launch) from title fallback so a fallback cannot masquerade as authoritative.
 */
export type AgentOwnerDecision = {
  agentType: AgentType | null
  source: 'hook' | 'foreground-process' | 'launch' | 'title' | 'none'
  confidence: 'authoritative' | 'fallback'
}

/**
 * Title-derived activity status for aggregate consumers. `livePtyRequired`
 * flags decisions that must be gated on live PTY evidence before contributing
 * to counts/ordering (e.g. restored panes).
 */
export type AgentActivityDecision = {
  status: 'working' | 'permission' | 'idle' | null
  source: 'hook' | 'title' | 'none'
  confidence: 'authoritative' | 'fallback'
  livePtyRequired: boolean
}

/**
 * Owner-aware display label. Wraps the compatible-owner title normalization so
 * the display label follows the resolved owner rather than raw wrapper text.
 */
export function resolvePaneDisplayTitle(
  title: string,
  ownerAgentType: AgentType | null | undefined
): string {
  return normalizeCompatibleAgentTitleForOwner(title, ownerAgentType)
}

export type ResolveTerminalTitleEvidenceInput = {
  rawTitle: string | null
  displayTitle: string | null
  source: TerminalTitleSource
  observedAt: number
  tabId: string
  leafId: string | null
  ptyId: string | null
  ptyGeneration: string | null
}

export function resolveTerminalTitleEvidence(
  input: ResolveTerminalTitleEvidenceInput
): TerminalTitleEvidence {
  return {
    rawTitle: input.rawTitle,
    displayTitle: input.displayTitle,
    source: input.source,
    observedAt: input.observedAt,
    tabId: input.tabId,
    leafId: input.leafId,
    ptyId: input.ptyId,
    ptyGeneration: input.ptyGeneration
  }
}

/**
 * The resolved decision for one OSC title frame: a single owner-aware display
 * label plus the renderer policy, so `updateTabTitle`, `setRuntimePaneTitle`,
 * task-completion tracking, and the GPU gate all consume one interpretation.
 */
export type PaneTitleDecision = {
  displayTitle: string
  rawTitle: string
  rendererPolicy: RendererPolicyDecision
}

export type ResolvePaneTitleDecisionInput = {
  /** Normalized title from the transport (may already be display-shaped). */
  normalizedTitle: string
  rawTitle: string
  /** Owner used for the display label — may include sticky/tab-scoped launch
   *  identity, which is correct for the visible label. */
  displayOwnerAgentType: AgentType | null | undefined
  /** Owner used for the renderer veto — must be pane-scoped and current so a
   *  sibling/reused pane's launch identity cannot keep GPU for a genuine
   *  Gemini pane. */
  rendererOwnerAgentType: AgentType | null | undefined
  userGpuMode: TerminalGpuAccelerationMode
  webglUnavailable?: boolean
  inContextLossContainment?: boolean
}

export function resolvePaneTitleDecision(input: ResolvePaneTitleDecisionInput): PaneTitleDecision {
  const displayTitle = resolvePaneDisplayTitle(input.normalizedTitle, input.displayOwnerAgentType)
  const rendererPolicy = resolvePaneRendererPolicy({
    rawTitle: input.rawTitle,
    ownerAgentType: input.rendererOwnerAgentType,
    userGpuMode: input.userGpuMode,
    webglUnavailable: input.webglUnavailable,
    inContextLossContainment: input.inContextLossContainment
  })
  return { displayTitle, rawTitle: input.rawTitle, rendererPolicy }
}
