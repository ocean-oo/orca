import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { selectLiveAgentStatusEntriesForWorktree } from './worktree-agent-row-selectors'

const PANE_KEY = makePaneKey('tab-1', '22222222-2222-4222-8222-222222222222')
const CHILD_PANE_KEY = makePaneKey('tab-child', '33333333-3333-4333-8333-333333333333')

function makeEntry(overrides?: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    paneKey: PANE_KEY,
    state: 'working',
    stateStartedAt: 1_000,
    updatedAt: 1_000,
    stateHistory: [],
    prompt: 'agent prompt',
    agentType: 'pi',
    worktreeId: 'wt-1',
    tabId: 'tab-1',
    ...overrides
  }
}

describe('selectLiveAgentStatusEntriesForWorktree closed-tab filtering', () => {
  it('does not render a completed live row whose tab is no longer current', () => {
    const staleDone = makeEntry({ state: 'done' })

    expect(
      selectLiveAgentStatusEntriesForWorktree(
        {
          tabsByWorktree: { 'wt-1': [] },
          agentStatusByPaneKey: { [PANE_KEY]: staleDone },
          migrationUnsupportedByPtyId: {},
          retainedAgentsByPaneKey: {}
        },
        'wt-1'
      )
    ).toEqual([])
  })

  it('does not render late child-agent rows routed to a closed tab', () => {
    const lateWorking = makeEntry({
      paneKey: CHILD_PANE_KEY,
      state: 'working',
      tabId: 'tab-closed'
    })

    expect(
      selectLiveAgentStatusEntriesForWorktree(
        {
          tabsByWorktree: { 'wt-1': [] },
          agentStatusByPaneKey: { [CHILD_PANE_KEY]: lateWorking },
          migrationUnsupportedByPtyId: {},
          recentlyClosedAgentStatusTabIds: { 'tab-closed': true },
          retainedAgentsByPaneKey: {}
        },
        'wt-1'
      )
    ).toEqual([])
  })
})
