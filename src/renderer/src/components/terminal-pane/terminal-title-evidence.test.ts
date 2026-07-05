import { describe, expect, it } from 'vitest'
import {
  resolvePaneDisplayTitle,
  resolvePaneTitleDecision,
  resolveTerminalTitleEvidence
} from './terminal-title-evidence'

describe('resolvePaneDisplayTitle', () => {
  it('normalizes a Pi-compatible title to the resolved OMP owner', () => {
    expect(resolvePaneDisplayTitle('Pi ready', 'omp')).toBe('OMP ready')
  })

  it('passes an unowned title through unchanged', () => {
    expect(resolvePaneDisplayTitle('bash', undefined)).toBe('bash')
  })
})

describe('resolveTerminalTitleEvidence', () => {
  it('carries pane/leaf/pty provenance for the frame', () => {
    const evidence = resolveTerminalTitleEvidence({
      rawTitle: '✦ Gemini CLI',
      displayTitle: '✦ Gemini CLI',
      source: 'osc',
      observedAt: 1234,
      tabId: 'tab-1',
      leafId: 'leaf-9',
      ptyId: 'pty-1',
      ptyGeneration: 'gen-2'
    })
    expect(evidence).toEqual({
      rawTitle: '✦ Gemini CLI',
      displayTitle: '✦ Gemini CLI',
      source: 'osc',
      observedAt: 1234,
      tabId: 'tab-1',
      leafId: 'leaf-9',
      ptyId: 'pty-1',
      ptyGeneration: 'gen-2'
    })
  })
})

describe('resolvePaneTitleDecision', () => {
  it('derives display label and renderer policy from one owner value', () => {
    const decision = resolvePaneTitleDecision({
      normalizedTitle: 'Pi ready',
      rawTitle: '✦ gemini in ~/omp',
      ownerAgentType: 'omp',
      userGpuMode: 'auto'
    })
    expect(decision.displayTitle).toBe('OMP ready')
    expect(decision.rawTitle).toBe('✦ gemini in ~/omp')
    // Why: the same OMP owner that renames the label also keeps GPU on despite
    // the Gemini glyph in the raw title.
    expect(decision.rendererPolicy.gpuEnabled).toBe(true)
  })

  it('DOM-gates a genuine Gemini pane while preserving its raw title', () => {
    const decision = resolvePaneTitleDecision({
      normalizedTitle: '✦ Gemini CLI',
      rawTitle: '✦ Gemini CLI',
      ownerAgentType: 'gemini',
      userGpuMode: 'auto'
    })
    expect(decision.rawTitle).toBe('✦ Gemini CLI')
    expect(decision.rendererPolicy.gpuEnabled).toBe(false)
    expect(decision.rendererPolicy.reason).toBe('agent-compatibility')
  })
})
