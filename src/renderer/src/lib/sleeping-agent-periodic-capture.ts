export const SLEEPING_AGENT_PERIODIC_CAPTURE_INTERVAL_MS = 60_000

/** Drive the resumable-agent quit-state capture on a timer.
 *
 * Why: beforeunload never fires when the app is hard-killed — the Windows
 * NSIS updater stops every Orca process before replacing the install dir,
 * and crashes skip teardown entirely. A periodic capture keeps a recent
 * resume record on disk for that case. A plain interval (not an on-change
 * debounce) is enough because captureAllSleepingAgentSessions skips the
 * store write when nothing changed, making idle ticks free. */
export function startSleepingAgentPeriodicCapture(options: {
  capture: () => void
  intervalMs?: number
}): () => void {
  const intervalMs = options.intervalMs ?? SLEEPING_AGENT_PERIODIC_CAPTURE_INTERVAL_MS
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    options.capture()
  }, intervalMs)
  return () => {
    clearInterval(timer)
  }
}
