import { describe, expect, it } from 'vitest'
import { AGENT_HOOK_TARGETS } from '../../shared/agent-hook-types'
import { MANAGED_AGENT_HOOK_TARGETS } from '../../shared/managed-agent-hook-targets'
import { getTuiAgentDetectCommands, TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import {
  assertManagedAgentHookManifestInvariants,
  MANAGED_AGENT_HOOK_MANIFEST
} from './managed-agent-hook-manifest'

describe('managed agent hook manifest', () => {
  it('keeps shared target descriptors aligned with the hook target enum', () => {
    expect(MANAGED_AGENT_HOOK_TARGETS.map((target) => target.agent)).toEqual(AGENT_HOOK_TARGETS)
    for (const target of MANAGED_AGENT_HOOK_TARGETS) {
      expect(target.executableCandidates).toEqual(
        getTuiAgentDetectCommands(TUI_AGENT_CONFIG[target.tuiAgent])
      )
    }
  })

  it('keeps main-process installers aligned with shared target descriptors', () => {
    expect(() => assertManagedAgentHookManifestInvariants()).not.toThrow()
    expect(MANAGED_AGENT_HOOK_MANIFEST.map((entry) => entry.target.agent)).toEqual(
      MANAGED_AGENT_HOOK_TARGETS.map((target) => target.agent)
    )
  })
})
