import type { Store } from '../persistence'
import { discoverSkills } from './discovery'
import { ManagedSkillUpdateCoordinator } from './managed-skill-updates'

const coordinatorByStore = new WeakMap<Store, ManagedSkillUpdateCoordinator>()

export function getManagedSkillUpdateCoordinator(store: Store): ManagedSkillUpdateCoordinator {
  const existing = coordinatorByStore.get(store)
  if (existing) {
    return existing
  }
  const coordinator = new ManagedSkillUpdateCoordinator({
    appVersion: process.env.npm_package_version,
    backgroundUpdatesEnabled: () =>
      store.getSettings().managedAgentSkillBackgroundUpdatesEnabled !== false,
    discoverHostSkills: (projectRootPath) =>
      discoverSkills({
        repos: store.getRepos(),
        ...(projectRootPath ? { cwd: projectRootPath } : {})
      })
  })
  coordinatorByStore.set(store, coordinator)
  return coordinator
}
