import type { SFTPWrapper } from 'ssh2'
import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'
import {
  getManagedAgentHookTarget,
  MANAGED_AGENT_HOOK_TARGETS,
  type ManagedAgentHookTarget
} from '../../shared/managed-agent-hook-targets'
import { ampHookService } from '../amp/hook-service'
import { antigravityHookService } from '../antigravity/hook-service'
import { claudeHookService } from '../claude/hook-service'
import { codexHookService } from '../codex/hook-service'
import { commandCodeHookService } from '../command-code/hook-service'
import { copilotHookService } from '../copilot/hook-service'
import { cursorHookService } from '../cursor/hook-service'
import { devinHookService } from '../devin/hook-service'
import { droidHookService } from '../droid/hook-service'
import { geminiHookService } from '../gemini/hook-service'
import { grokHookService } from '../grok/hook-service'
import { hermesHookService } from '../hermes/hook-service'
import { kimiHookService } from '../kimi/hook-service'
import { openClaudeHookService } from '../openclaude/hook-service'

export type ManagedAgentHookManifestEntry = {
  target: ManagedAgentHookTarget
  install: () => AgentHookInstallStatus
  remove: () => AgentHookInstallStatus
  getStatus: () => AgentHookInstallStatus
  installRemote?: (sftp: SFTPWrapper, remoteHome: string) => Promise<AgentHookInstallStatus>
}

function requiredTarget(agent: AgentHookTarget): ManagedAgentHookTarget {
  const target = getManagedAgentHookTarget(agent)
  if (!target) {
    throw new Error(`Missing managed agent hook target for ${agent}`)
  }
  return target
}

export const MANAGED_AGENT_HOOK_MANIFEST: readonly ManagedAgentHookManifestEntry[] = [
  {
    target: requiredTarget('claude'),
    install: () => claudeHookService.install(),
    remove: () => claudeHookService.remove(),
    getStatus: () => claudeHookService.getStatus(),
    installRemote: (sftp, remoteHome) => claudeHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('openclaude'),
    install: () => openClaudeHookService.install(),
    remove: () => openClaudeHookService.remove(),
    getStatus: () => openClaudeHookService.getStatus(),
    installRemote: (sftp, remoteHome) => openClaudeHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('codex'),
    install: () => codexHookService.install(),
    remove: () => codexHookService.remove(),
    getStatus: () => codexHookService.getStatus(),
    installRemote: (sftp, remoteHome) => codexHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('gemini'),
    install: () => geminiHookService.install(),
    remove: () => geminiHookService.remove(),
    getStatus: () => geminiHookService.getStatus(),
    installRemote: (sftp, remoteHome) => geminiHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('antigravity'),
    install: () => antigravityHookService.install(),
    remove: () => antigravityHookService.remove(),
    getStatus: () => antigravityHookService.getStatus(),
    installRemote: (sftp, remoteHome) => antigravityHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('amp'),
    install: () => ampHookService.install(),
    remove: () => ampHookService.remove(),
    getStatus: () => ampHookService.getStatus(),
    installRemote: (sftp, remoteHome) => ampHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('cursor'),
    install: () => cursorHookService.install(),
    remove: () => cursorHookService.remove(),
    getStatus: () => cursorHookService.getStatus(),
    installRemote: (sftp, remoteHome) => cursorHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('droid'),
    install: () => droidHookService.install(),
    remove: () => droidHookService.remove(),
    getStatus: () => droidHookService.getStatus()
  },
  {
    target: requiredTarget('command-code'),
    install: () => commandCodeHookService.install(),
    remove: () => commandCodeHookService.remove(),
    getStatus: () => commandCodeHookService.getStatus(),
    installRemote: (sftp, remoteHome) => commandCodeHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('grok'),
    install: () => grokHookService.install(),
    remove: () => grokHookService.remove(),
    getStatus: () => grokHookService.getStatus(),
    installRemote: (sftp, remoteHome) => grokHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('copilot'),
    install: () => copilotHookService.install(),
    remove: () => copilotHookService.remove(),
    getStatus: () => copilotHookService.getStatus()
  },
  {
    target: requiredTarget('hermes'),
    install: () => hermesHookService.install(),
    remove: () => hermesHookService.remove(),
    getStatus: () => hermesHookService.getStatus(),
    installRemote: (sftp, remoteHome) => hermesHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('devin'),
    install: () => devinHookService.install(),
    remove: () => devinHookService.remove(),
    getStatus: () => devinHookService.getStatus(),
    installRemote: (sftp, remoteHome) => devinHookService.installRemote(sftp, remoteHome)
  },
  {
    target: requiredTarget('kimi'),
    install: () => kimiHookService.install(),
    remove: () => kimiHookService.remove(),
    getStatus: () => kimiHookService.getStatus(),
    installRemote: (sftp, remoteHome) => kimiHookService.installRemote(sftp, remoteHome)
  }
]

export function getManagedAgentHookManifestEntry(
  agent: AgentHookTarget
): ManagedAgentHookManifestEntry | undefined {
  return MANAGED_AGENT_HOOK_MANIFEST.find((entry) => entry.target.agent === agent)
}

export function assertManagedAgentHookManifestInvariants(): void {
  const manifestAgents = MANAGED_AGENT_HOOK_MANIFEST.map((entry) => entry.target.agent)
  const targetAgents = MANAGED_AGENT_HOOK_TARGETS.map((entry) => entry.agent)
  if (manifestAgents.join('\0') !== targetAgents.join('\0')) {
    throw new Error('Managed agent hook manifest is out of sync with target descriptors')
  }
  for (const entry of MANAGED_AGENT_HOOK_MANIFEST) {
    if (entry.target.supportsRemoteManagedHooks !== Boolean(entry.installRemote)) {
      throw new Error(`Managed agent hook remote support mismatch for ${entry.target.agent}`)
    }
  }
}
