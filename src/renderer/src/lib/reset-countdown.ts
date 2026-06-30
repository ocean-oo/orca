/**
 * Formats the time remaining until a usage window resets.
 *
 * Shared by the expanded usage popover and the collapsed status-bar badge so
 * both render the same live countdown (e.g. "3h 31m", "45m", "2d 4h") instead
 * of a fixed window-length label.
 */
export function formatResetDuration(ms: number): string {
  if (ms <= 0) {
    return 'now'
  }
  const totalMins = Math.floor(ms / 60_000)
  if (totalMins < 60) {
    return `${totalMins}m`
  }
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function formatResetCountdown(ms: number): string {
  const duration = formatResetDuration(ms)
  return duration === 'now' ? 'Resets now' : `Resets in ${duration}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function getResetCountdownNextTickDelay(
  now: number,
  resetTimes: readonly number[]
): number | null {
  let nextDelay: number | null = null
  for (const resetAt of resetTimes) {
    if (!Number.isFinite(resetAt) || resetAt <= now) {
      continue
    }
    const remainingMs = resetAt - now
    const tickUnitMs = remainingMs >= DAY_MS ? HOUR_MS : MINUTE_MS
    // Why: labels are floored to minutes/hours; tick just after the next
    // boundary so the badge and panel update exactly when their text changes.
    const delayMs = (remainingMs % tickUnitMs) + 1
    nextDelay = nextDelay === null ? delayMs : Math.min(nextDelay, delayMs)
  }
  return nextDelay
}
