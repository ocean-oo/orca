import type { ManagedAgentSkillEnsureRequest, SkillDiscoveryResult } from '../../shared/skills'
import { selectSingleGlobalManagedSkillCandidate } from './managed-skill-global-candidate'
import { readManagedSkillLockEntry } from './managed-skill-lockfile'

export async function verifyManagedSkillPostUpdate(args: {
  discoverHostSkills: (projectRootPath?: string | null) => Promise<SkillDiscoveryResult>
  homeDir: string
  readTextFile: (path: string) => Promise<string>
  request: ManagedAgentSkillEnsureRequest
}): Promise<{ ok: true; lockHash: string } | { ok: false }> {
  const postDiscovery = await args.discoverHostSkills(args.request.discoveryTarget?.projectRootPath)
  const postCandidateDecision = selectSingleGlobalManagedSkillCandidate({
    discovery: postDiscovery,
    homeDir: args.homeDir,
    projectRootPath: args.request.discoveryTarget?.projectRootPath,
    skillName: args.request.skillName
  })
  if (postCandidateDecision.status === 'fallback') {
    return { ok: false }
  }

  const postLockEntryResult = await readManagedSkillLockEntry({
    homeDir: args.homeDir,
    readTextFile: args.readTextFile,
    skillName: args.request.skillName
  })
  return postLockEntryResult.ok
    ? { ok: true, lockHash: postLockEntryResult.entry.skillFolderHash }
    : { ok: false }
}
