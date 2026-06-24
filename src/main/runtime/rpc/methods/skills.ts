import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { discoverSkills } from '../../../skills/discovery'
import { onManagedSkillEvent } from '../../../skills/managed-skill-events'

let managedSkillEventsSubscriptionSeq = 0

export const SKILL_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'skills.discover',
    params: null,
    handler: async (_params, { runtime }) => discoverSkills({ repos: runtime.listRepos() })
  }),
  defineStreamingMethod({
    name: 'skills.managedEvents',
    params: null,
    handler: async (_params, { runtime, connectionId }, emit) => {
      await new Promise<void>((resolve) => {
        const unsubscribe = onManagedSkillEvent((event) => {
          emit(event)
        })

        const seq = ++managedSkillEventsSubscriptionSeq
        const subscriptionId = `skills-managed-events-${connectionId ?? 'inproc'}-${seq}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )

        emit({ type: 'ready', subscriptionId })
      })
    }
  })
]
