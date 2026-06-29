import { getAgentLabel, titleHasAgentName } from '../../../shared/agent-detection'
import type { TuiAgent } from '../../../shared/types'

// Maps getAgentLabel()'s product labels to TuiAgent ids — the fallback for
// agents whose foreground PROCESS name isn't self-identifying (Claude Code runs
// as `node`, but its "✳ Claude Code" title resolves here). Agents whose process
// name already matches (codex, etc.) never reach this path.
const TITLE_LABEL_TO_AGENT: Partial<Record<string, TuiAgent>> = {
  'Claude Code': 'claude',
  OpenClaude: 'openclaude',
  Codex: 'codex',
  'Gemini CLI': 'gemini',
  'GitHub Copilot': 'copilot',
  Grok: 'grok',
  Devin: 'devin',
  Antigravity: 'antigravity',
  OpenCode: 'opencode',
  'MiMo Code': 'mimo-code',
  Aider: 'aider',
  Cursor: 'cursor',
  Droid: 'droid',
  Hermes: 'hermes',
  Pi: 'pi',
  OMP: 'omp'
}

function containsBrailleSpinner(title: string): boolean {
  for (const char of title) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && codePoint >= 0x2800 && codePoint <= 0x28ff) {
      return true
    }
  }
  return false
}

function hasGenericClaudeStatusPrefix(title: string): boolean {
  return (
    containsBrailleSpinner(title) ||
    title.startsWith('✳ ') ||
    title === '✳' ||
    title.startsWith('. ') ||
    title.startsWith('* ')
  )
}

function isGenericClaudeStatusClaim(title: string, titleAgent: TuiAgent | null): boolean {
  return (
    titleAgent === 'claude' &&
    hasGenericClaudeStatusPrefix(title) &&
    !titleHasAgentName(title, 'claude')
  )
}

function isBrailleClaudeTitleNamingBuriedAgent(title: string, label: string): boolean {
  // Why: a braille spinner is a generic Claude status prefix shared with Codex,
  // Cursor, Droid, etc., so getAgentLabel()'s per-agent token match (which runs
  // before its Claude braille fallback) resolves a competing agent whose name
  // is merely buried in Claude task text ("⠋ Review Codex behavior"). Unlike
  // the "✳"/". "/"* " prefixes, the braille prefix does not short-circuit to
  // Claude, so isGenericClaudeStatusClaim cannot see it. A genuine synthetic
  // agent title leads with the product name right after the spinner; when the
  // body does not, the title is Claude activity, not that agent's identity.
  if (label === 'Claude Code' || !containsBrailleSpinner(title)) {
    return false
  }
  // eslint-disable-next-line no-control-regex -- intentional braille range
  const body = title.replace(/^[⠀-⣿]+\s*/, '').trimStart()
  return !body.toLowerCase().startsWith(label.toLowerCase())
}

/**
 * Resolve a terminal title's agent identity, but treat Claude's bare status
 * prefixes (spinner / "✳" / ". " / "* ") as activity-only. They are evidence
 * that something is running, not proof the agent is Claude — so a task or
 * worktree title cannot become Claude without an explicit "Claude Code" name.
 */
export function resolveExplicitTerminalTitleAgentType(title: string): TuiAgent | null {
  const label = getAgentLabel(title)
  const titleAgent = label ? (TITLE_LABEL_TO_AGENT[label] ?? null) : null
  if (isGenericClaudeStatusClaim(title, titleAgent)) {
    return null
  }
  if (label !== null && isBrailleClaudeTitleNamingBuriedAgent(title, label)) {
    return null
  }
  return titleAgent
}
