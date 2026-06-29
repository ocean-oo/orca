import { describe, expect, it } from 'vitest'
import { resolveExplicitTerminalTitleAgentType } from './terminal-title-agent-type'

describe('resolveExplicitTerminalTitleAgentType', () => {
  it('maps explicit product-name titles to their TuiAgent id', () => {
    expect(resolveExplicitTerminalTitleAgentType('✳ Claude Code')).toBe('claude')
    expect(resolveExplicitTerminalTitleAgentType('⠋ Codex')).toBe('codex')
    expect(resolveExplicitTerminalTitleAgentType('✦ Gemini CLI')).toBe('gemini')
    expect(resolveExplicitTerminalTitleAgentType('MiMo Code')).toBe('mimo-code')
    expect(resolveExplicitTerminalTitleAgentType('⠋ OpenClaude')).toBe('openclaude')
    expect(resolveExplicitTerminalTitleAgentType('OMP')).toBe('omp')
  })

  it('treats Claude generic status prefixes as activity-only, not identity', () => {
    expect(resolveExplicitTerminalTitleAgentType('✳ investigating startup')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('⠸ investigating startup')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('. Compare Opencode Vs Orca')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('* Review Codex behavior')).toBeNull()
  })

  it('treats a braille-spinner Claude title that buries another agent name as activity-only', () => {
    // Why: regression for #6543 — a braille spinner is a generic Claude status
    // prefix, so getAgentLabel resolves the buried agent before its Claude
    // braille fallback. These are Claude task titles, not Codex/Gemini tabs.
    expect(resolveExplicitTerminalTitleAgentType('⠋ Review Codex behavior')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('⠸ investigate gemini integration')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('⠋ migrate from Aider')).toBeNull()
  })

  it('still resolves Claude when the title explicitly names Claude', () => {
    expect(resolveExplicitTerminalTitleAgentType('. Claude Code compare Opencode')).toBe('claude')
  })

  it('returns null for plain shell and unknown titles', () => {
    expect(resolveExplicitTerminalTitleAgentType('Terminal 1')).toBeNull()
    expect(resolveExplicitTerminalTitleAgentType('zsh')).toBeNull()
  })
})
