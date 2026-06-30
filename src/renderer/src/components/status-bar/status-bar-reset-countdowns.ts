import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import { formatResetDuration } from '@/lib/reset-countdown'
import { formatWindowLabel } from '@/lib/window-label-formatter'

export function formatStatusBarSessionWindowLabel(w: RateLimitWindow, now: number): string {
  // Why: the status badge should show time until reset when the provider reports
  // one, while preserving the fixed window-length fallback for unknown resets.
  return w.resetsAt != null
    ? formatResetDuration(w.resetsAt - now)
    : formatWindowLabel(w.windowMinutes)
}

export function collectStatusBarResetTimes(
  providers: readonly (ProviderRateLimits | null)[]
): number[] {
  const resetTimes: number[] = []
  for (const provider of providers) {
    if (!provider) {
      continue
    }
    const windows: (RateLimitWindow | null | undefined)[] = [
      provider.session,
      provider.weekly,
      provider.monthly,
      ...(provider.buckets ?? [])
    ]
    for (const window of windows) {
      if (window?.resetsAt != null) {
        resetTimes.push(window.resetsAt)
      }
    }
    const resetCreditExpiry = provider.rateLimitResetCredits?.nextExpiresAt
    if (resetCreditExpiry != null) {
      resetTimes.push(resetCreditExpiry)
    }
  }
  return resetTimes
}
