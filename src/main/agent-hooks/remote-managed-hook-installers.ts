import type { SFTPWrapper } from 'ssh2'
import type {
  AgentHookInstallSkipReason,
  AgentHookInstallStatus,
  AgentHookTarget
} from '../../shared/agent-hook-types'
import type { AgentCliPresenceResult } from '../../shared/managed-agent-hook-targets'
import { MANAGED_AGENT_HOOK_MANIFEST } from './managed-agent-hook-manifest'

export type RemoteManagedHookPresenceByAgent = Partial<
  Record<AgentHookTarget, AgentCliPresenceResult>
>

function skippedStatus(
  agent: AgentHookTarget,
  remoteHome: string,
  skipReason: AgentHookInstallSkipReason,
  detail: string
): AgentHookInstallStatus {
  return {
    agent,
    state: 'skipped',
    configPath: remoteHome,
    managedHooksPresent: false,
    detail,
    skipReason
  }
}

export function hasRemoteManagedHookInstallCandidate(
  presenceByAgent: RemoteManagedHookPresenceByAgent
): boolean {
  return MANAGED_AGENT_HOOK_MANIFEST.some(
    (entry) =>
      Boolean(entry.installRemote) && presenceByAgent[entry.target.agent]?.state === 'found'
  )
}

export async function installRemoteManagedAgentHooks(
  sftp: SFTPWrapper,
  remoteHome: string,
  presenceByAgent: RemoteManagedHookPresenceByAgent
): Promise<AgentHookInstallStatus[]> {
  const results: AgentHookInstallStatus[] = []
  for (const entry of MANAGED_AGENT_HOOK_MANIFEST) {
    const agent = entry.target.agent
    if (!entry.installRemote) {
      results.push(
        skippedStatus(
          agent,
          remoteHome,
          'remote_hook_unsupported',
          'Remote managed hooks unsupported.'
        )
      )
      continue
    }
    const presence = presenceByAgent[agent]
    if (presence?.state !== 'found') {
      results.push(
        skippedStatus(
          agent,
          remoteHome,
          presence?.state === 'unknown' ? 'remote_presence_unavailable' : 'cli_not_found',
          presence?.state === 'unknown'
            ? 'Remote CLI presence unknown; managed hook install skipped.'
            : 'Remote CLI not found; managed hook install skipped.'
        )
      )
      continue
    }
    try {
      const result = await entry.installRemote(sftp, remoteHome)
      results.push(result)
      if (result.state === 'error') {
        console.warn(
          `[agent-hooks] Remote ${agent} managed hook install failed for ${result.configPath}: ${
            result.detail ?? 'unknown error'
          }`
        )
      }
    } catch (error) {
      // Why: remote hook installation must not block SSH workspace startup.
      // A broken agent config or transient SFTP failure should degrade status
      // reporting only, while terminals/filesystem/git still come online.
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`[agent-hooks] Remote ${agent} managed hook install threw: ${detail}`)
      results.push({
        agent,
        state: 'error',
        configPath: remoteHome,
        managedHooksPresent: false,
        detail
      })
    }
  }
  return results
}
