import type { WorktreeCreateTiming, WorktreeCreateTimingPhase } from '../shared/types'

type TimingClock = () => number

export type WorktreeCreateTimingRecorder = {
  time<T>(phase: string, operation: () => Promise<T>): Promise<T>
  timeSync<T>(phase: string, operation: () => T): T
  finish(): WorktreeCreateTiming
}

function defaultClock(): number {
  return performance.now()
}

function clampDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function createPhase(
  phase: string,
  operationStartedAt: number,
  operationEndedAt: number,
  rootStartedAt: number
): WorktreeCreateTimingPhase {
  return {
    phase,
    startedAtMs: clampDuration(operationStartedAt - rootStartedAt),
    durationMs: clampDuration(operationEndedAt - operationStartedAt)
  }
}

// Why: the timing payload is returned over IPC but nothing displays it, so a
// slow create was previously undiagnosable from logs. One line per create
// keeps phase-level regressions visible in the main-process log.
export function formatWorktreeCreateTiming(timing: WorktreeCreateTiming): string {
  const phases = timing.phases
    .map((phase) => `${phase.phase}=${Math.round(phase.durationMs)}ms`)
    .join(' ')
  return `${Math.round(timing.totalDurationMs)}ms total${phases ? ` (${phases})` : ''}`
}

export function createWorktreeCreateTimingRecorder(
  clock: TimingClock = defaultClock
): WorktreeCreateTimingRecorder {
  const startedAt = clock()
  const phases: WorktreeCreateTimingPhase[] = []

  const recordPhase = (phase: string, operationStartedAt: number): void => {
    phases.push(createPhase(phase, operationStartedAt, clock(), startedAt))
  }

  return {
    async time<T>(phase: string, operation: () => Promise<T>): Promise<T> {
      const operationStartedAt = clock()
      try {
        return await operation()
      } finally {
        recordPhase(phase, operationStartedAt)
      }
    },
    timeSync<T>(phase: string, operation: () => T): T {
      const operationStartedAt = clock()
      try {
        return operation()
      } finally {
        recordPhase(phase, operationStartedAt)
      }
    },
    finish() {
      return {
        totalDurationMs: clampDuration(clock() - startedAt),
        phases: [...phases]
      }
    }
  }
}
