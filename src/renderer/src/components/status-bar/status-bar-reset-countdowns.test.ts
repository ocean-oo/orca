import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import {
  collectStatusBarResetTimes,
  formatStatusBarSessionWindowLabel
} from './status-bar-reset-countdowns'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

function sessionWindow(overrides: Partial<RateLimitWindow> = {}): RateLimitWindow {
  return {
    usedPercent: 3,
    windowMinutes: 300,
    resetsAt: null,
    resetDescription: null,
    ...overrides
  }
}

function provider(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: 0,
    error: null,
    status: 'ok',
    ...overrides
  }
}

describe('formatStatusBarSessionWindowLabel', () => {
  it('uses the live reset countdown instead of the fixed session window length', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')

    expect(
      formatStatusBarSessionWindowLabel(sessionWindow({ resetsAt: now + HOUR + 20 * MINUTE }), now)
    ).toBe('1h 20m')
  })

  it('falls back to the fixed window length when reset time is unknown', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')

    expect(formatStatusBarSessionWindowLabel(sessionWindow({ resetsAt: null }), now)).toBe('5h')
  })
})

describe('collectStatusBarResetTimes', () => {
  it('collects visible provider reset times for the shared status-bar clock', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')
    const sessionReset = now + HOUR
    const weeklyReset = now + 2 * HOUR
    const bucketReset = now + 3 * HOUR
    const resetCreditExpiry = now + 4 * HOUR

    expect(
      collectStatusBarResetTimes([
        provider({
          session: sessionWindow({ resetsAt: sessionReset }),
          weekly: sessionWindow({ windowMinutes: 10_080, resetsAt: weeklyReset }),
          buckets: [{ name: 'Pro', ...sessionWindow({ resetsAt: bucketReset }) }],
          rateLimitResetCredits: {
            availableCount: 1,
            nextExpiresAt: resetCreditExpiry
          }
        }),
        null
      ])
    ).toEqual([sessionReset, weeklyReset, bucketReset, resetCreditExpiry])
  })
})
