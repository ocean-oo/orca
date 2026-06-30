import { describe, expect, it } from 'vitest'
import {
  formatResetCountdown,
  formatResetDuration,
  getResetCountdownNextTickDelay
} from './reset-countdown'

const HOUR = 60 * 60_000
const MINUTE = 60_000

describe('formatResetDuration', () => {
  it('returns "now" for zero or negative durations', () => {
    expect(formatResetDuration(0)).toBe('now')
    expect(formatResetDuration(-1)).toBe('now')
  })

  it('preserves the existing "0m" copy for sub-minute positive durations', () => {
    // Why: issue #5399 only changes the status badge's source value; the
    // expanded panel and Codex reset-credit final-minute wording stay stable.
    expect(formatResetDuration(1)).toBe('0m')
    expect(formatResetDuration(30_000)).toBe('0m')
    expect(formatResetDuration(59_999)).toBe('0m')
  })

  it('returns whole minutes under an hour', () => {
    expect(formatResetDuration(45 * MINUTE)).toBe('45m')
    expect(formatResetDuration(MINUTE)).toBe('1m')
  })

  it('floors partial minutes', () => {
    expect(formatResetDuration(90_000)).toBe('1m')
  })

  it('shows hours and minutes — the issue #5399 session case', () => {
    // Session window with 3h 31m left should read "3h 31m", not a fixed "5h".
    expect(formatResetDuration(3 * HOUR + 31 * MINUTE)).toBe('3h 31m')
    expect(formatResetDuration(HOUR + 20 * MINUTE)).toBe('1h 20m')
  })

  it('omits minutes on a whole hour', () => {
    expect(formatResetDuration(5 * HOUR)).toBe('5h')
  })

  it('shows days and hours past 24h (weekly windows)', () => {
    expect(formatResetDuration(2 * 24 * HOUR + 4 * HOUR)).toBe('2d 4h')
    expect(formatResetDuration(3 * 24 * HOUR)).toBe('3d')
  })
})

describe('formatResetCountdown', () => {
  it('prefixes "Resets in" for positive durations', () => {
    expect(formatResetCountdown(3 * HOUR + 31 * MINUTE)).toBe('Resets in 3h 31m')
  })

  it('preserves the existing final-minute label', () => {
    expect(formatResetCountdown(30_000)).toBe('Resets in 0m')
  })

  it('reads "Resets now" once elapsed', () => {
    expect(formatResetCountdown(0)).toBe('Resets now')
    expect(formatResetCountdown(-1)).toBe('Resets now')
  })
})

describe('getResetCountdownNextTickDelay', () => {
  it('ticks just after the next minute boundary for minute-granularity labels', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')
    const resetAt = now + 3 * MINUTE + 12_345

    expect(getResetCountdownNextTickDelay(now, [resetAt])).toBe(12_346)
  })

  it('ticks just after the reset time during the final minute', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')
    const resetAt = now + 30_000

    expect(getResetCountdownNextTickDelay(now, [resetAt])).toBe(30_001)
  })

  it('ticks on the soonest reset label boundary across providers', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')

    expect(
      getResetCountdownNextTickDelay(now, [now + 10 * MINUTE + 45_000, now + 5 * MINUTE + 5_000])
    ).toBe(5_001)
  })

  it('uses hour boundaries for day-granularity labels', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')
    const resetAt = now + 2 * 24 * HOUR + 4 * HOUR + 17 * MINUTE

    expect(getResetCountdownNextTickDelay(now, [resetAt])).toBe(17 * MINUTE + 1)
  })

  it('does not schedule a tick when no future reset is visible', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')

    expect(getResetCountdownNextTickDelay(now, [])).toBeNull()
    expect(getResetCountdownNextTickDelay(now, [now, now - 1])).toBeNull()
  })
})
