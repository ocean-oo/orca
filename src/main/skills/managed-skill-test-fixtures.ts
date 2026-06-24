import { homedir } from 'node:os'
import { join } from 'node:path'
import { ORCHESTRATION_SKILL_NAME } from '../../shared/agent-feature-install-commands'
import type {
  DiscoveredSkill,
  ManagedAgentSkillEnsureRequest,
  ManagedAgentSkillName,
  SkillDiscoveryResult
} from '../../shared/skills'

export const TEST_MANAGED_HOME_ROOT = join(homedir(), '.agents', 'skills')

export const orchestrationRequest: ManagedAgentSkillEnsureRequest = {
  skillName: ORCHESTRATION_SKILL_NAME,
  context: 'agent-orchestration',
  discoveryTarget: { runtime: 'host', projectRootPath: '/workspace/current' }
}

export function discoveredSkill(
  patch: Partial<DiscoveredSkill> & Pick<DiscoveredSkill, 'name' | 'sourceKind'>
): DiscoveredSkill {
  const rootPath = patch.rootPath ?? TEST_MANAGED_HOME_ROOT
  const directoryPath = patch.directoryPath ?? join(rootPath, patch.name)
  return {
    id: patch.id ?? `${patch.sourceKind}-${patch.name}`,
    name: patch.name,
    description: patch.description ?? null,
    providers: patch.providers ?? ['agent-skills'],
    sourceKind: patch.sourceKind,
    sourceLabel: patch.sourceLabel ?? patch.sourceKind,
    rootPath,
    directoryPath,
    realDirectoryPath: patch.realDirectoryPath ?? directoryPath,
    directoryIsSymlink: patch.directoryIsSymlink ?? false,
    skillFilePath: patch.skillFilePath ?? join(directoryPath, 'SKILL.md'),
    realSkillFilePath: patch.realSkillFilePath ?? join(directoryPath, 'SKILL.md'),
    skillFileIsSymlink: patch.skillFileIsSymlink ?? false,
    installed: patch.installed ?? true,
    fileCount: patch.fileCount ?? 1,
    updatedAt: patch.updatedAt ?? 1
  }
}

export function discovery(skills: DiscoveredSkill[]): SkillDiscoveryResult {
  return { skills, sources: [], scannedAt: 1 }
}

export function homeDiscovery(
  skillName: ManagedAgentSkillName = ORCHESTRATION_SKILL_NAME
): SkillDiscoveryResult {
  return discovery([discoveredSkill({ name: skillName, sourceKind: 'home' })])
}

export function lockfile(skillName: ManagedAgentSkillName, skillFolderHash: string): string {
  return JSON.stringify({
    version: 3,
    skills: {
      [skillName]: {
        source: 'stablyai/orca',
        sourceType: 'github',
        sourceUrl: 'https://github.com/stablyai/orca.git',
        skillPath: `skills/${skillName}/SKILL.md`,
        skillFolderHash
      }
    }
  })
}
