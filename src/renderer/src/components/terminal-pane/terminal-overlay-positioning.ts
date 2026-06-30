type TerminalOverlayGlobalScope = typeof globalThis & {
  __ORCA_WEB_CLIENT__?: boolean
}

const TERMINAL_OVERLAY_CSS_ANCHORS_ENABLED = false

function hasTerminalOverlayCssAnchorPositioning(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS.supports('position-anchor', '--orca-terminal-overlay-probe') &&
    CSS.supports('top', 'anchor(--orca-terminal-overlay-probe top)') &&
    CSS.supports('width', 'anchor-size(--orca-terminal-overlay-probe width)')
  )
}

export function shouldUseTerminalOverlayCssAnchorPositioning(
  globalScope: TerminalOverlayGlobalScope = globalThis as TerminalOverlayGlobalScope
): boolean {
  // Why: native CSS anchor positioning has shown idle renderer CPU/jitter on
  // newer Electron/macOS builds (#4364, #6655). The fallback is
  // ResizeObserver-driven and already covers unsupported/web-client runtimes.
  return (
    TERMINAL_OVERLAY_CSS_ANCHORS_ENABLED &&
    hasTerminalOverlayCssAnchorPositioning() &&
    globalScope.__ORCA_WEB_CLIENT__ !== true
  )
}

export function shouldObserveTerminalOverlayFallbackRect(args: {
  anchorName: string | undefined
  groupId: string | undefined
  isVisible: boolean
  shouldMeasureHiddenStartup: boolean
  useCssAnchorPositioning?: boolean
}): boolean {
  return Boolean(
    args.anchorName &&
    args.groupId &&
    (args.isVisible || args.shouldMeasureHiddenStartup) &&
    !(args.useCssAnchorPositioning ?? shouldUseTerminalOverlayCssAnchorPositioning())
  )
}
