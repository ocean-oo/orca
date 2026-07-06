import { AGENT_HOOK_TARGETS, type AgentHookTarget } from './agent-hook-types'
import { getTuiAgentDetectCommands, TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './types'

export const REMOTE_AGENT_HOOK_CLI_PRESENCE_METHOD = 'agentHooks.detectCliPresence' as const

export type AgentCliPresenceState = 'found' | 'missing' | 'unknown'

export type AgentCliPresenceResult = {
  state: AgentCliPresenceState
}

export type AgentHookCliPresenceRequest = {
  agents: readonly AgentHookTarget[]
  overrideExecutableTokens?: Partial<Record<AgentHookTarget, string>>
}

export type AgentHookCliPresenceResponse = {
  presence: Partial<Record<AgentHookTarget, AgentCliPresenceResult>>
}

export type ManagedAgentHookTarget = {
  agent: AgentHookTarget
  tuiAgent: TuiAgent
  executableCandidates: readonly string[]
  supportsRemoteManagedHooks: boolean
}

const REMOTE_MANAGED_HOOK_TARGETS = new Set<AgentHookTarget>([
  'claude',
  'openclaude',
  'codex',
  'gemini',
  'antigravity',
  'amp',
  'cursor',
  'command-code',
  'grok',
  'hermes',
  'devin',
  'kimi'
])

function target(agent: AgentHookTarget, tuiAgent: TuiAgent = agent): ManagedAgentHookTarget {
  return {
    agent,
    tuiAgent,
    executableCandidates: getTuiAgentDetectCommands(TUI_AGENT_CONFIG[tuiAgent]),
    supportsRemoteManagedHooks: REMOTE_MANAGED_HOOK_TARGETS.has(agent)
  }
}

// Why: hook ownership labels and TUI launch ids live in different domains.
// Keeping the mapping serializable lets main and relay agree without importing
// per-agent hook services into the relay bundle.
export const MANAGED_AGENT_HOOK_TARGETS: readonly ManagedAgentHookTarget[] = AGENT_HOOK_TARGETS.map(
  (agent) => target(agent)
)

export function getManagedAgentHookTarget(
  agent: AgentHookTarget
): ManagedAgentHookTarget | undefined {
  return MANAGED_AGENT_HOOK_TARGETS.find((targetEntry) => targetEntry.agent === agent)
}

export function isManagedAgentHookTarget(value: unknown): value is AgentHookTarget {
  return (
    typeof value === 'string' &&
    MANAGED_AGENT_HOOK_TARGETS.some((targetEntry) => targetEntry.agent === value)
  )
}
