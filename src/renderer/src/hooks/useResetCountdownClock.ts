import { useEffect, useMemo, useRef, useState } from 'react'
import { getResetCountdownNextTickDelay } from '@/lib/reset-countdown'

function resetTimesKey(resetTimes: readonly (number | null | undefined)[]): string {
  return resetTimes
    .filter((resetAt): resetAt is number => resetAt != null && Number.isFinite(resetAt))
    .sort((a, b) => a - b)
    .join('|')
}

function parseResetTimesKey(key: string): number[] {
  return key.length === 0 ? [] : key.split('|').map((value) => Number(value))
}

export function useResetCountdownClock(resetTimes: readonly (number | null | undefined)[]): number {
  const [scheduledNow, setScheduledNow] = useState(() => Date.now())
  const key = useMemo(() => resetTimesKey(resetTimes), [resetTimes])
  const times = useMemo(() => parseResetTimesKey(key), [key])
  const previousKeyRef = useRef(key)
  const immediateNowRef = useRef(scheduledNow)

  if (previousKeyRef.current !== key) {
    previousKeyRef.current = key
    immediateNowRef.current = Date.now()
  }

  const now = Math.max(scheduledNow, immediateNowRef.current)

  useEffect(() => {
    const delayMs = getResetCountdownNextTickDelay(now, times)
    if (delayMs === null) {
      return
    }
    const timeout = window.setTimeout(() => setScheduledNow(Date.now()), delayMs)
    return () => window.clearTimeout(timeout)
  }, [now, times])

  return now
}
