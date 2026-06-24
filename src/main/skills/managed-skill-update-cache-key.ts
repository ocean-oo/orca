import { isAbsolute, normalize, relative, sep } from 'node:path'
import type {
  ManagedAgentSkillEnsureRequest,
  ManagedAgentSkillEnsureResult,
  ManagedAgentSkillFallbackReason,
  ManagedAgentSkillRuntime
} from '../../shared/skills'

export function shouldCooldownFallback(result: ManagedAgentSkillEnsureResult): boolean {
  return (
    result.status === 'fallback' &&
    result.reason !== 'cooldown' &&
    result.reason !== 'background-update-disabled'
  )
}

export function makeManagedSkillSuccessCacheKey(args: {
  appVersion: string
  request: ManagedAgentSkillEnsureRequest
  currentLockHash: string
}): string {
  return [args.appVersion, 'host', '', 'global', args.request.skillName, args.currentLockHash].join(
    ':'
  )
}

export function makeManagedSkillTargetFallbackCacheKey(args: {
  appVersion: string
  distro?: string | null
  reason: ManagedAgentSkillFallbackReason
  request: ManagedAgentSkillEnsureRequest
  runtime: ManagedAgentSkillRuntime
}): string {
  return [
    args.appVersion,
    args.runtime,
    args.distro ?? '',
    'target-fallback',
    normalizeManagedSkillKeyPart(args.request.context),
    normalizeManagedSkillKeyPart(args.request.discoveryTarget?.projectRootPath),
    args.request.skillName,
    args.reason
  ].join(':')
}

export function makeManagedSkillPreDiscoveryCacheKey(args: {
  appVersion: string
  backgroundUpdatesEnabled: boolean
  distro?: string | null
  request: ManagedAgentSkillEnsureRequest
  runtime: Extract<ManagedAgentSkillRuntime, 'host' | 'wsl'>
}): string {
  return [
    args.appVersion,
    args.runtime,
    args.distro ?? '',
    'pre-discovery',
    args.backgroundUpdatesEnabled ? 'background-updates-on' : 'background-updates-off',
    normalizeManagedSkillKeyPart(args.request.context),
    normalizeManagedSkillKeyPart(args.request.discoveryTarget?.projectRootPath),
    args.request.skillName
  ].join(':')
}

export function normalizeManagedSkillKeyPart(value: string | null | undefined): string {
  return value ? normalizePathForManagedSkillKey(value) : ''
}

export function normalizePathForManagedSkillKey(value: string): string {
  const normalized = normalize(value)
  const stripped = normalized.endsWith(sep) ? normalized.slice(0, -1) : normalized
  return process.platform === 'win32' ? stripped.toLowerCase() : stripped
}

export function isRelevantManagedProjectCandidate(
  rootPath: string,
  projectRootPath: string | null | undefined
): boolean {
  if (!projectRootPath) {
    return false
  }
  const rel = relative(projectRootPath, rootPath)
  if (!rel) {
    return true
  }
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
