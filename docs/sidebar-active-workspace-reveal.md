# Sidebar Active Workspace Reveal

## Problem or goal

When Orca opens, the worktree sidebar can land at an arbitrary scroll position instead of showing the active workspace. Users also need an explicit sidebar affordance to jump back to the current workspace and automatically open any collapsed repo, status-group, pinned, or lineage sections that hide it.

## Current behavior

- The sidebar viewport restores raw scroll offset on mount from an app-level ref, and the virtualizer also seeds its initial window from that same offset. This preserves position across sidebar remounts, but it does not ensure the active workspace is visible on app open. See [src/renderer/src/App.tsx](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/App.tsx:271) and [src/renderer/src/hooks/useVirtualizedScrollAnchor.ts](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/hooks/useVirtualizedScrollAnchor.ts:154).
- The worktree list already has a reveal pipeline driven by `pendingRevealWorktreeId`. That pipeline expands collapsed lineage ancestors, the pinned group, and the active grouping bucket, then scrolls the target row into view with `align: 'auto'`. See [src/renderer/src/components/sidebar/WorktreeList.tsx](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/components/sidebar/WorktreeList.tsx:557).
- Explicit workspace activation paths call `revealWorktreeInSidebar(worktreeId)`, but startup restore does not. That means click/navigation flows reveal correctly, while initial app load can show a stale or otherwise non-useful viewport. See [src/renderer/src/lib/worktree-activation.ts](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/lib/worktree-activation.ts:181) and [src/renderer/src/store/slices/ui.ts](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/store/slices/ui.ts:922).
- The active workspace is already known in the sidebar render tree and is used to mark the current row, so the missing piece is reveal timing, not selection state. See [src/renderer/src/components/sidebar/WorktreeList.tsx](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/components/sidebar/WorktreeList.tsx:1945) and [src/renderer/src/components/sidebar/WorktreeList.tsx](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/components/sidebar/WorktreeList.tsx:1233).
- The bottom sidebar toolbar has room for an additional compact action and already uses the correct tooltip/button primitives for icon-only controls. See [src/renderer/src/components/sidebar/SidebarToolbar.tsx](/Users/thebr/orca/workspaces/orca/open-scroll/src/renderer/src/components/sidebar/SidebarToolbar.tsx:279).

## Proposed design

### 1. Keep one reveal pipeline, but make the request typed and repeatable

Do not build a separate “scroll to active workspace” implementation. Keep the existing reveal pipeline as the single mechanism that:

- resolves the target workspace,
- expands collapsed containers that hide it,
- and scrolls the virtualized list to the target row.

Replace `pendingRevealWorktreeId: string | null` with an ephemeral request object:

- `worktreeId: string`
- `reason: 'activation' | 'startup' | 'manual-button'`
- `behavior: 'auto' | 'smooth'`
- `requestKey: string` or monotonic number

Why this change:

- Startup and manual reveal need different scroll behavior, but should still share the same executor.
- A unique `requestKey` lets the same workspace be revealed twice in a row without relying on store identity quirks.
- The reveal effect can reason about whether a request is startup-only or user-triggered without adding side channels.

### 2. Add a startup-only active-workspace reveal pass, but gate it on hydrated state

Add a `useEffect` in `WorktreeList` that runs only after the sidebar has enough restored state to make a stable reveal decision.

- Preconditions:
  - `activeWorktreeId` is non-null
  - workspace-session hydration has completed
  - persisted UI hydration has completed, so collapsed-group and filter state are final for this mount
  - the active workspace exists in hydrated worktree data
  - the effect has not already run for the current startup/mount cycle
  - there is no existing pending reveal request
- Action:
  - enqueue a reveal request for `activeWorktreeId` with `reason: 'startup'` and `behavior: 'auto'`

Why this shape:

- It intentionally funnels startup through the same expansion + virtual-scroll logic already used by explicit activation.
- It only runs once per startup/mount cycle, so it will not keep fighting user scroll after the app is open.
- It avoids changing `activeWorktreeId` or `activeView`; startup should reveal the current workspace, not reinterpret navigation state.
- Gating on hydration matters because firing before UI/session restore settles can produce a false miss, clear the request too early, or scroll to a row that moves again once collapsed/filter state finishes restoring.

Implementation detail:

- Track a local `hasQueuedInitialActiveRevealRef`.
- Reset that ref only when the sidebar truly remounts for a new app session, not when ordinary row updates happen.
- Skip the effect if a reveal is already pending so explicit navigation wins.

### 3. Preserve smooth manual reveal, but use instant startup reveal

Behavior rules:

- Existing activation flows keep `behavior: 'smooth'`.
- Startup reveal uses `behavior: 'auto'` so launch lands deterministically on the active workspace instead of animating from a stale offset.
- The manual button uses `behavior: 'smooth'`.

This keeps the list pleasant during normal interaction without making startup feel jumpy or delayed.

### 4. Add a sidebar button to reveal the current workspace

Add an icon-only ghost button in the right-side icon cluster of `SidebarToolbar`, next to the existing utility actions.

Button behavior:

- On click, if `activeWorktreeId` exists, call `revealWorktreeInSidebar(activeWorktreeId)` with `reason: 'manual-button'`.
- If no active workspace exists, disable the button.
- Tooltip label: `Reveal current workspace`.

Why this placement:

- It is always visible in the sidebar.
- It matches existing compact utility actions and tooltip patterns in the same toolbar.
- It avoids adding noise to each worktree row or to the already busier sidebar header.

### 5. Let reveal open collapsed containers, but do not clear unrelated filters

Keep current reveal semantics for collapsed groups and lineage expansion. Do not widen the feature into “clear all filters until you can see the workspace” for the manual button or startup path.

Reasoning:

- The existing activation helper already clears repo filters when switching to another workspace because that is a navigation action.
- Startup reveal and the manual button should be less destructive: they should open collapsed containers, but they should not silently discard user filter state.
- If the active workspace is excluded by filters, the button can no-op and optionally show a tooltip-disabled state later; that is a smaller behavioral change than mutating filter state behind the user’s back.

### 6. Make the reveal executor retain requests until they are actually resolvable

Update the existing reveal effect in `WorktreeList` so it only clears a pending request when one of these is true:

- the target row was found and a scroll attempt was issued; or
- the target worktree no longer exists, so the request is invalid.

If the target workspace still exists but its row is temporarily absent because grouping, filtering, or hydration inputs are still settling, keep the request queued for the next render instead of clearing it immediately.

Why this matters:

- The current bare-id flow is safe for explicit activation because the row usually exists by the time reveal runs.
- Startup reveal is more timing-sensitive: worktree data, persisted UI state, and virtual rows can settle across adjacent renders.
- Clearing on first miss would reintroduce the original bug in a more intermittent form.

## Alternatives considered

### A. Scroll directly from the toolbar button without store state

Rejected. `SidebarToolbar` does not own the virtualizer or the collapsed-group expansion logic, so this would either duplicate sidebar internals or require brittle imperative refs threaded across components.

### B. Reuse `activateAndRevealWorktree()` for the toolbar button

Rejected. The button is a visibility affordance, not navigation. Routing it through activation would incorrectly switch `activeView` to terminal and re-run selection side effects the user did not ask for.

### C. Restore only the persisted scroll offset

Rejected. The bad open-app position is a symptom of list shape changing across hydration and collapsed sections. Restoring an offset alone cannot guarantee the active workspace is visible and cannot open the containers that hide it.

## Edge cases

- Active workspace is inside collapsed lineage groups: reveal must expand every valid lineage ancestor before scrolling.
- Active workspace is pinned: reveal should expand only the pinned section, not its underlying status/repo bucket.
- Active workspace is hidden by `tasks` or `activity` full-page views: startup auto-reveal should skip, because those views intentionally suppress sidebar selection styling.
- Active workspace is filtered out by repo/active-only/default-branch filters: startup reveal and the manual button should not clear filters automatically.
- No active workspace exists: startup effect and manual button both no-op; the button should be disabled.
- Startup hydration has restored `activeWorktreeId`, but rows are not renderable yet: keep the request pending until the row can be resolved or the worktree becomes invalid.
- Another action queues an activation/manual reveal before the startup effect fires: explicit navigation wins, and startup should mark itself complete instead of enqueueing a second competing request.
- Active workspace row is already visible: reveal should remain effectively a no-op apart from clearing any pending request.
- SSH/remote workspaces: reveal logic must stay renderer-only and depend only on sidebar row presence/state, not local filesystem assumptions.

## Test plan

### Unit / component coverage

- Add `WorktreeList` tests covering startup auto-reveal queuing:
  - queues exactly one reveal for the restored `activeWorktreeId`
  - waits for workspace-session hydration and persisted UI hydration before queuing
  - does not queue repeatedly after row/filter resorting
  - skips when `pendingRevealWorktreeId` is already set
  - skips when there is no active workspace
- Extend reveal-pipeline tests to cover request metadata:
  - startup requests use `behavior: 'auto'`
  - activation/manual requests use `behavior: 'smooth'`
  - requests stay pending when the worktree exists but the row is not yet renderable
  - requests clear only after scrolling or after the target worktree disappears
- Add toolbar tests for the new button:
  - enabled when `activeWorktreeId` exists
  - disabled when it does not
  - clicking dispatches reveal for the active workspace

### Playwright coverage

- Add an end-to-end test that restores a session with:
  - multiple repos/groups,
  - the active workspace outside the initial viewport,
  - and its parent group collapsed.
  - Expect app launch to land with the active workspace visible and its required containers expanded.
- Add a second scenario where the user collapses the containing group, clicks `Reveal current workspace`, and expects the row to become visible again.

## Rollout order

1. Extend the reveal request state from `string` to a typed payload.
2. Update the existing reveal effect in `WorktreeList` to consume the new payload, honor scroll behavior, and retain unresolved requests.
3. Add the startup one-shot auto-reveal effect behind hydration gates.
4. Add the toolbar button wired to the shared reveal action.
5. Add unit/component coverage.
6. Add Playwright coverage for startup and manual reveal.

## ref-oss usage

Not used. The risk is local to Orca’s existing virtualized sidebar and reveal behavior, and the current in-repo reveal pipeline already provides the implementation pattern to reuse.
