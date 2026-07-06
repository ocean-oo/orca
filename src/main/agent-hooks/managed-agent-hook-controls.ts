import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'
import type { GlobalSettings } from '../../shared/types'
import { MANAGED_AGENT_HOOK_MANIFEST } from './managed-agent-hook-manifest'
import { detectLocalManagedAgentCliPresence } from './local-agent-cli-presence'

type InstallOptions = {
  shouldHydrateShellPath?: boolean
  onInstallError?: (agent: AgentHookInstallStatus['agent'], error: unknown) => void
  shouldContinue?: () => boolean
  agents?: readonly AgentHookTarget[]
}

type ManagedHookInstaller = readonly [AgentHookInstallStatus['agent'], () => AgentHookInstallStatus]

export function isAgentStatusHooksEnabled(
  settings: Pick<GlobalSettings, 'agentStatusHooksEnabled'> | null | undefined
): boolean {
  return settings?.agentStatusHooksEnabled !== false
}

export async function installManagedAgentHooks(
  settings?: Pick<GlobalSettings, 'agentCmdOverrides'> | null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  const allowedAgents = options.agents ? new Set(options.agents) : null
  const manifestEntries = allowedAgents
    ? MANAGED_AGENT_HOOK_MANIFEST.filter((entry) => allowedAgents.has(entry.target.agent))
    : MANAGED_AGENT_HOOK_MANIFEST
  let presenceByAgent
  try {
    presenceByAgent = await detectLocalManagedAgentCliPresence(
      manifestEntries.map((entry) => entry.target),
      settings,
      { shouldHydrateShellPath: options.shouldHydrateShellPath }
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return manifestEntries.map((entry) => ({
      agent: entry.target.agent,
      state: 'skipped',
      configPath: '',
      managedHooksPresent: false,
      detail,
      skipReason: 'cli_presence_unknown'
    }))
  }
  if (options.shouldContinue && !options.shouldContinue()) {
    return manifestEntries.map((entry) => ({
      agent: entry.target.agent,
      state: 'skipped',
      configPath: '',
      managedHooksPresent: false,
      detail: 'Agent status hooks were disabled before install completed.',
      skipReason: 'hooks_disabled'
    }))
  }
  const installers: ManagedHookInstaller[] = []
  const skipped: AgentHookInstallStatus[] = []
  for (const entry of manifestEntries) {
    const presence = presenceByAgent[entry.target.agent]
    if (presence?.state === 'found') {
      installers.push([entry.target.agent, entry.install])
      continue
    }
    skipped.push({
      agent: entry.target.agent,
      state: 'skipped',
      configPath: '',
      managedHooksPresent: false,
      detail: 'CLI not found; managed hook install skipped.',
      skipReason: presence?.state === 'unknown' ? 'cli_presence_unknown' : 'cli_not_found'
    })
  }
  return [...runManagedHookInstallers(installers, options.onInstallError), ...skipped]
}

function errorStatus(
  agent: AgentHookInstallStatus['agent'],
  error: unknown
): AgentHookInstallStatus {
  return {
    agent,
    state: 'error',
    configPath: '',
    managedHooksPresent: false,
    detail: error instanceof Error ? error.message : String(error)
  }
}

function runManagedHookInstallers(
  installers: readonly ManagedHookInstaller[],
  onInstallError: InstallOptions['onInstallError']
): AgentHookInstallStatus[] {
  const results: AgentHookInstallStatus[] = []
  for (const [agent, install] of installers) {
    try {
      results.push(install())
    } catch (error) {
      console.error(`[agent-hooks] Failed to install ${agent} managed hooks:`, error)
      try {
        onInstallError?.(agent, error)
      } catch (telemetryError) {
        console.error('[agent-hooks] Failed to record install-failure telemetry:', telemetryError)
      }
      results.push(errorStatus(agent, error))
    }
  }
  return results
}

export function removeManagedAgentHooks(): AgentHookInstallStatus[] {
  return MANAGED_AGENT_HOOK_MANIFEST.map((entry) => {
    try {
      return entry.remove()
    } catch (error) {
      return errorStatus(entry.target.agent, error)
    }
  })
}

export function getManagedAgentHookStatuses(): AgentHookInstallStatus[] {
  return MANAGED_AGENT_HOOK_MANIFEST.map((entry) => {
    try {
      return entry.getStatus()
    } catch (error) {
      return errorStatus(entry.target.agent, error)
    }
  })
}

export async function applyAgentStatusHooksEnabled(
  enabled: boolean,
  settings?: Pick<GlobalSettings, 'agentCmdOverrides'> | null,
  options?: InstallOptions
): Promise<AgentHookInstallStatus[]> {
  if (enabled) {
    return await installManagedAgentHooks(settings, options)
  }
  return removeManagedAgentHooks()
}
