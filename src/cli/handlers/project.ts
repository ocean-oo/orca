import type {
  Project,
  ProjectHostSetup,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  RepoKind
} from '../../shared/types'
import type { CommandHandler } from '../dispatch'
import {
  formatProjectHostSetupList,
  formatProjectHostSetupResult,
  formatProjectList,
  printResult
} from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { resolveRepoPathArgument } from '../repo-path-arguments'
import { RuntimeClientError } from '../runtime-client'

function getOptionalRepoKind(flags: Map<string, string | boolean>): RepoKind | undefined {
  const kind = getOptionalStringFlag(flags, 'kind')
  if (kind === undefined) {
    return undefined
  }
  if (kind === 'git' || kind === 'folder') {
    return kind
  }
  throw new RuntimeClientError('invalid_argument', '--kind must be git or folder')
}

export const PROJECT_HANDLERS: Record<string, CommandHandler> = {
  'project list': async ({ client, json }) => {
    const result = await client.call<{ projects: Project[] }>('project.list')
    printResult(result, json, formatProjectList)
  },
  'project setups': async ({ flags, client, json }) => {
    const projectFilter = getOptionalStringFlag(flags, 'project')
    const hostFilter = getOptionalStringFlag(flags, 'host')
    const result = await client.call<{ setups: ProjectHostSetup[] }>('projectHostSetup.list')
    const setups = result.result.setups.filter(
      (setup) =>
        (projectFilter === undefined || setup.projectId === projectFilter) &&
        (hostFilter === undefined || setup.hostId === hostFilter)
    )
    printResult({ ...result, result: { setups } }, json, formatProjectHostSetupList)
  },
  'project setup-existing-folder': async ({ flags, client, cwd, json }) => {
    const rawPath = getRequiredStringFlag(flags, 'path')
    const args: ProjectHostSetupExistingFolderArgs = {
      projectId: getRequiredStringFlag(flags, 'project'),
      hostId: getRequiredStringFlag(flags, 'host') as ProjectHostSetupExistingFolderArgs['hostId'],
      path: resolveRepoPathArgument(rawPath, cwd, client.isRemote, 'Remote project setup'),
      kind: getOptionalRepoKind(flags),
      displayName: getOptionalStringFlag(flags, 'display-name')
    }
    const result = await client.call<{ result: ProjectHostSetupResult }>(
      'projectHostSetup.setupExistingFolder',
      args
    )
    printResult(result, json, formatProjectHostSetupResult)
  }
}
