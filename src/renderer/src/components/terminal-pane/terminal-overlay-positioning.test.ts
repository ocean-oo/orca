import { describe, expect, it } from 'vitest'
import {
  shouldObserveTerminalOverlayFallbackRect,
  shouldUseTerminalOverlayCssAnchorPositioning
} from './terminal-overlay-positioning'

describe('terminal overlay positioning', () => {
  it('keeps native CSS anchor positioning disabled by default', () => {
    expect(shouldUseTerminalOverlayCssAnchorPositioning()).toBe(false)
  })

  it('observes fallback geometry only while the terminal slot is measurable', () => {
    const base = {
      anchorName: '--tab-body',
      groupId: 'group-1'
    }

    expect(
      shouldObserveTerminalOverlayFallbackRect({
        ...base,
        isVisible: false,
        shouldMeasureHiddenStartup: false
      })
    ).toBe(false)
    expect(
      shouldObserveTerminalOverlayFallbackRect({
        ...base,
        isVisible: false,
        shouldMeasureHiddenStartup: true
      })
    ).toBe(true)
    expect(
      shouldObserveTerminalOverlayFallbackRect({
        ...base,
        isVisible: true,
        shouldMeasureHiddenStartup: false
      })
    ).toBe(true)
  })

  it('does not observe fallback geometry when CSS anchors are active', () => {
    expect(
      shouldObserveTerminalOverlayFallbackRect({
        anchorName: '--tab-body',
        groupId: 'group-1',
        isVisible: true,
        shouldMeasureHiddenStartup: false,
        useCssAnchorPositioning: true
      })
    ).toBe(false)
  })
})
