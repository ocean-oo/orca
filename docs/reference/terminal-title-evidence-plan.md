# Terminal Title Evidence Plan

## Context

Issue #7428 exposed a boundary problem in Orca's terminal-agent state. The tab
identity path had already grown a better precedence model around hook status,
foreground process, launch identity, and title fallback, but OSC terminal titles
still fed some consumers directly. A Pi/OMP title whose cwd mentioned `gemini`
could therefore be normalized as Gemini and could trigger the Gemini-specific
GPU fallback, even though the authoritative agent identity was OMP.

The fix in #7447 narrows the immediate false positive. This plan is the follow-up
to prevent the same class of bug from reappearing as more agents and title formats
are added.

## Current Shape

- OSC title bytes are parsed by `src/renderer/src/components/terminal-pane/pty-transport.ts`.
  Its internal `applyObservedTerminalTitle` closure normalizes the display title
  and separately feeds the raw title to the title status tracker.
- `src/renderer/src/components/terminal-pane/pty-connection.ts` receives both
  normalized and raw title strings in `onTitleChange`. It currently:
  - normalizes compatible wrapped-agent titles against the authoritative owner;
  - toggles pane GPU rendering from `isGeminiTerminalTitle(rawTitle)`;
  - writes `runtimePaneTitlesByTabId`;
  - writes the focused tab label with `updateTabTitle`;
  - lets task-completion tracking observe the raw title.
- `src/renderer/src/lib/use-tab-agent.ts` resolves the tab icon/agent identity
  from hook status, foreground process, title fallback, and launch identity. This
  is the closest thing to the desired precedence model.
- `runtimePaneTitlesByTabId` and `tab.title` remain title-derived status inputs
  for active-agent targeting, running-agent send targets, worktree/sidebar status,
  title-bar counts, dock badges, and startup/readiness waits.
- Native Chat uses title fallback to resolve whether a focused leaf is a supported
  Claude/Codex chat candidate before hooks arrive.
- Workspace cleanup and Workspace Space use title-derived active/permission state
  as safety/count inputs when no fresh explicit row is present.
- Prompt-cache timer seeding and synthetic hook-title replacement inspect title
  status for timer and display replacement decisions.
- Store writes split between `updateTabTitle` and `setRuntimePaneTitle` in
  `src/renderer/src/store/slices/terminals.ts`. `updateTabTitle` is optimized to
  avoid rebuilding unrelated worktrees on high-churn OSC frames; `setRuntimePaneTitle`
  deliberately bumps sort/activity only when title classification changes.
- Sidebar smart attention and title-derived agent rows still use title fallback for
  hookless panes, while suppressing panes already covered by fresh hook rows.
- Hook payload handling in `src/renderer/src/hooks/useIpcEvents.ts` is mostly
  authoritative, but has a compatibility shim (`resolveHookPayloadAgentType`)
  that rewrites a `claude` hook payload's agent type to `openclaude` when the
  terminal title names OpenClaude, because OpenClaude emits Claude-compatible
  hooks.
- Shared detection helpers in `src/shared/agent-detection.ts` still combine
  display normalization, status inference, label extraction, and a Gemini renderer
  predicate in one title-string API surface. Title-based agent-type extraction
  (`resolveExplicitTerminalTitleAgentType`, aliased as `resolveTabAgentFromTitle`
  by `use-tab-agent.ts`) lives separately in
  `src/shared/terminal-title-agent-type.ts`.

## Broad App Consistency Audit

Source-of-truth behavior should be: one pane has one current agent owner and one
current activity status, each with confidence/source metadata. Product surfaces may
render that state differently, but they should not independently reinterpret raw
title text.

Current neighboring surfaces:

- Tab strip: icon uses `useTabAgent`; label uses focused pane title through
  `updateTabTitle`.
- Split-pane headers: display per-pane title from `runtimePaneTitlesByTabId`.
- Sidebar/worktree card: status dot uses explicit agent rows plus title fallback.
- Sidebar smart ordering: attention class uses hook rows first, then title fallback
  for uncovered live panes.
- Dashboard/title-derived agent rows: creates rows from title fallback when no
  explicit row owns the pane.
- Title-bar count and dock badge: count working agents from runtime pane titles or
  tab title fallback.
- Workspace Space: active-agent count uses fresh hook rows, migration blockers,
  then live title fallback.
- Workspace cleanup: title-derived working/permission can conservatively block
  deletion while terminals are live.
- Native Chat toggle/leaf resolution: launch/live identity wins, with title
  fallback for manually started supported agents.
- Review-notes send menus and active-agent send: title/launch may expose a target,
  but runtime calls must still verify sendability before writing input.
- Notifications/task-complete tracking: raw titles still inform completion timing
  and idle transitions.
- Prompt cache and synthetic status titles: title status can seed restored cache
  timers or decide whether a hook-provided synthetic title should replace the
  current terminal title.
- Renderer policy: user/auto GPU settings are capability-based, but the Gemini
  exception currently enters through title classification.

Observed disagreements today:

- Tab identity has a precedence model; renderer policy still has a raw-title
  predicate.
- Tab label intentionally follows focused pane; sidebar/counts intentionally
  aggregate all panes. That difference is correct, but it depends on pane-scoped
  title evidence staying mapped to the correct leaf.
- Title fallback is necessary for hookless/legacy sessions, but several surfaces
  call `detectAgentStatusFromTitle` directly, so any future broadening of title
  detection can affect counts, smart ordering, send-target eligibility, and rows
  at once.
- Hook identity correction from title is a deliberate compatibility exception. It
  should stay narrow and documented as an exception to hook authority.

## Source-Flow Inventory

Title and identity evidence enters Orca through these flows:

- OSC 0/1/2 title frames: PTY output scan, title normalization, per-pane title
  store, tab label, title-status tracker, task-completion tracker, renderer policy.
- Hook payloads: main hook server, renderer attribution/connection checks,
  identity normalization, explicit agent rows, synthetic titles, notifications.
- Launch agent: tab creation/startup config, immediate bootstrap icon/status,
  initial status seed for agents without prompt-start hooks.
- Foreground process: local OSC 133 command boundaries, process-name inspection,
  pane foreground agent store, shell-foreground exit evidence.
- Runtime send/readiness: title and launch hints may reveal candidates, but runtime
  RPCs are the final authority before sending input.
- Safety/timer consumers: cleanup blockers, prompt-cache seeding, and synthetic
  title replacement use title status as conservative runtime evidence.

Activity and surface status taxonomy:

- Title-derived activity states are only `working`, `permission`, `idle`, or
  `null`.
- Explicit hook states are mapped separately: `blocked`/`waiting` become
  user-visible `permission`, `working` remains `working`, and `done` remains
  `done`.
- Worktree/card surfaces then apply visual ordering:
  `permission > working > done > active > inactive`.
- Fresh explicit rows should suppress same-pane title fallback.
- Stale explicit rows may be re-enabled only by live, pane-mapped title evidence.
- Tab-title fallback is allowed only when no pane titles/hook mapping exists.

## Problem Statement

Separate pipelines are not inherently wrong. Tab labels, agent identity, activity
status, task completion, and renderer policy have different consumers and timing
needs. The smell is that several consumers treat a raw or normalized terminal title
as an authority instead of a typed piece of evidence with source and precedence.

The concrete risk pattern:

1. A terminal title contains an agent-like token as cwd, repo name, session title,
   or wrapper text.
2. One consumer sees that token as display text, while another treats it as agent
   identity or renderer policy.
3. The consumer bypasses the stronger launch/hook/foreground-process evidence.
4. UI state splits: tab icon, tab label, sidebar status, send target, and renderer
   behavior disagree.

## Design Goal

Create one narrow terminal-title evidence layer that all title-consuming paths can
share without forcing a large rewrite.

The layer should preserve existing behavior where titles are the only available
signal, but it must make these distinctions explicit:

- raw OSC title bytes;
- normalized display label;
- title source;
- title-derived agent/status evidence;
- authoritative owner identity from hook/process/launch state;
- consumer intent: display, status, identity fallback, or renderer policy.

## Invariants

1. Raw OSC title text may provide display text and weak status evidence. It must
   not directly decide agent ownership or renderer policy when stronger evidence
   exists.
2. Hook payload identity wins over title-derived identity for a live pane.
3. Local foreground-process identity wins over title-derived identity at command
   boundaries. A foreground shell marker clears stale title identity for local
   panes.
4. Launch identity is authoritative during bootstrap, but it can be cleared or
   overridden after activity proves pane reuse or process exit.
5. Title-derived identity is allowed only as a fallback for legacy or unknown
   sessions, or as an explicit stale-launch override after observed activity.
6. Renderer policy must depend on an explicit renderer capability/compatibility
   decision, not a broad agent-name title match.
7. Split-pane aggregate consumers must use pane-scoped evidence first and fall
   back to `tab.title` only before pane evidence exists.
8. Sleep/restore paths must gate title-derived working/permission status on live
   PTY evidence unless an explicit fresh agent row is present.
9. SSH/remote panes cannot assume local foreground-process inspection exists.
   Remote behavior must either use runtime-provided evidence or degrade to title
   fallback with weaker confidence.
10. Compatibility shims where title text corrects hook identity must name the
    exact provider pair and must not become generic title-over-hook precedence.

## Proposed Model

Add small shared/renderer-facing decision types, preferably near the terminal pane
domain rather than buried in a generic helper file.

```ts
type TerminalTitleSource = 'osc' | 'hook' | 'launch' | 'foreground-process' | 'restore'

type TerminalTitleEvidence = {
  rawTitle: string | null
  displayTitle: string | null
  source: TerminalTitleSource
  observedAt: number
  tabId: string
  leafId: string | null
  ptyId: string | null
  ptyGeneration: string | null
}

type AgentOwnerDecision = {
  agentType: AgentType | null
  source: 'hook' | 'foreground-process' | 'launch' | 'title' | 'none'
  confidence: 'authoritative' | 'fallback'
}

type AgentActivityDecision = {
  status: 'working' | 'permission' | 'idle' | null
  source: 'hook' | 'title' | 'none'
  confidence: 'authoritative' | 'fallback'
  livePtyRequired: boolean
}

type RendererPolicyDecision = {
  gpuEnabled: boolean
  reason: 'user-setting' | 'capability' | 'context-loss' | 'agent-compatibility'
  confidence: 'authoritative' | 'fallback'
}
```

Do not start by storing these shapes globally if that causes churn. The first step
can be pure resolver functions that take the values Orca already has and return a
typed decision for each consumer. Keep owner, activity, display, and renderer
decisions separate so authoritative hook ownership cannot accidentally make
fallback title activity look authoritative, and fallback title activity cannot
override authoritative ownership.

Suggested API split:

- `resolveTerminalTitleEvidence(...)`: parses raw/normalized title evidence.
- `resolvePaneAgentOwner(...)`: centralizes hook/process/launch/title precedence.
- `resolvePaneDisplayTitle(...)`: owner-aware display label normalization.
- `resolvePaneRendererPolicy(...)`: maps settings/capability/failure state and
  owner/evidence to WebGL/DOM renderer choice.
- `resolvePaneActivityStatus(...)`: exposes title-derived status with liveness and
  explicit-row gates for aggregate consumers.

Renderer policy precedence:

1. Explicit user setting `off` disables GPU.
2. Explicit user setting `on` enables GPU unless WebGL is unavailable or the pane
   is in context-loss/crash containment. Agent compatibility exclusions must not
   override explicit `on` unless the setting is redefined as "force on except
   known crashers" in a separate user-facing product decision.
3. `auto` follows platform/WebGL capability, context-loss recovery, and known
   compatibility exclusions.
4. Known Gemini compatibility fallback may disable GPU only when resolved owner or
   high-confidence title evidence identifies a genuine Gemini terminal and the
   effective user setting is `auto`.
5. Fallback title evidence must not disable GPU when stronger owner evidence says
   the pane is another agent or shell.
6. Remote/SSH runtime paths must use the same resolved policy and must not require
   local foreground-process evidence.

## Phased Implementation

### Phase 1: Name And Fence The Current Behavior

Introduce the resolver types and wire only `pty-connection.ts`.

- Move the raw-title GPU check behind `resolvePaneRendererPolicy`.
- Keep the existing Gemini fallback behavior, but pass in owner evidence so OMP/Pi
  compatible ownership cannot be bypassed by raw title text.
- Return both `displayTitle` and `rawTitle` from the resolver so `updateTabTitle`,
  `setRuntimePaneTitle`, and task-completion tracking do not each re-interpret the
  title independently.
- Add regression tests where cwd/session names contain every known agent token:
  `gemini`, `claude`, `codex`, `opencode`, `cursor`, `omp`, and `pi`.
- Keep `updateTabTitle` and `setRuntimePaneTitle` write frequency unchanged. The
  resolver should return the same stable display labels currently used to avoid
  broad store churn.
- Include renderer-policy tests for user GPU modes (`auto`, `on`, `off`), WebGL
  unavailable/context-loss state, genuine Gemini compatibility, and non-Gemini
  owner evidence with Gemini-like cwd/session text.

### Phase 2: Move Aggregate Status Consumers To Pane Evidence

Update title-based aggregate consumers to call a shared status resolver instead of
calling `detectAgentStatusFromTitle` directly:

- `getWorkingAgentsPerWorktree` and `countWorkingAgents`;
- `getWorktreeStatus` and `resolveWorktreeStatus`;
- sidebar smart attention;
- title-derived agent rows;
- Workspace Space active-agent count;
- workspace cleanup blockers/liveness;
- Native Chat leaf/title fallback and availability (an identity consumer via
  `resolveTabAgentFromTitle`, not `detectAgentStatusFromTitle`; migrate it under
  the identity/owner resolver, not the status resolver);
- prompt-cache timer seeding;
- synthetic hook title replacement;
- `deriveRunningAgentSendTargets`;
- active-terminal note targeting/readiness;
- agent-ready waits.

Keep the live-PTY and explicit-agent-row gates those modules already have. The
goal is not to remove their safety checks; it is to make their title status input
consistent and confidence-aware.

Mechanical migration gate:

- After Phase 2, no product authority path should import `detectAgentStatusFromTitle`,
  `getAgentLabel`, `resolveExplicitTerminalTitleAgentType`, or
  `resolveTabAgentFromTitle` directly.
- Approved direct-use adapters should be listed in the PR body. Expected allowlist:
  low-level title-evidence resolvers, transport title parsing/coalescing,
  completion tracking, decorative-frame filtering, and tests.
- Each removed direct call site must be classified by intent: display, status,
  identity, safety, timer, renderer, or send/readiness.
- The implementation PR should include an `rg` audit in validation output showing
  any remaining direct imports and why each is approved.

Audit scoping caveats (verified against the tree on 2026-07-05):

- `getAgentLabel` is a name collision. Only the export from
  `src/shared/agent-detection.ts` is the title predicate. An unrelated display
  helper `getAgentLabel(agent: TuiAgent)` lives in
  `src/renderer/src/lib/agent-catalog.tsx` (plus a local variant in
  `AutomationsPage.tsx`) with its own consumers. The migration audit must match
  on import source, not bare identifier, or it will flag innocent sites.
- `detectAgentStatusFromTitle` also has main-process authority call sites:
  `src/main/stats/agent-detector.ts` and multiple sites in
  `src/main/runtime/orca-runtime.ts` (including a runtime-side
  `getWorktreeStatus` and an agent-readiness wait). The Phase 2 consumer list is
  renderer-scoped, so the "no product authority path imports it" gate is only
  reachable if those main/runtime sites are migrated in their own slice or
  explicitly carried on the allowlist with an owner and a follow-up.
- The expected surviving direct call sites match the approved allowlist today:
  `pty-transport.ts` title coalescing (transport parsing),
  `agent-completion-coordinator.ts` and `agent-decorative-title-signature.ts`
  (completion/decorative filtering), and tests.

### Phase 3: Separate Display Normalization From Identity Detection

Split `src/shared/agent-detection.ts` into clearer domains:

- title display normalization;
- title status detection;
- title agent label/type extraction;
- renderer compatibility policy.

Avoid vague module names. Candidate names:

- `terminal-title-evidence.ts`;
- `terminal-title-status.ts`;
- `terminal-title-display.ts`;
- `terminal-renderer-policy.ts`.

`src/shared/terminal-title-agent-type.ts` already exists as the title agent-type
extraction module; the split should fold into or align with it rather than
creating a competing identity module.

This phase should also retire public call sites that use `isGeminiTerminalTitle`
for anything other than Gemini title compatibility detection. Renderer policy
should call a renderer-policy function, not an agent-title function. As of
2026-07-05 the only renderer-policy use is the `setPaneGpuRendering` toggle in
`pty-connection.ts`; the `title-agent-identity.ts` use is identity detection and
stays with the identity domain.

### Phase 4: Persist Only Stable Evidence

Review what survives sleep/restore:

- `runtimePaneTitlesByTabId`;
- `titlesByLeafId`;
- tab-level `title`;
- retained `agentStatusByPaneKey`.

Persist display titles when needed for UX and restore, but do not persist fallback
identity as if it were authoritative. If a future evidence object is stored, store
its source/confidence so restored tabs cannot promote stale title evidence without
live PTY or fresh hook confirmation.

## Reliability Regression Gate

Touched reliability classes:

- PTY identity/routing: title frames must remain scoped to the pane/leaf that
  emitted them.
- Hidden-to-visible resume and attach/replay: restored titles can appear before
  live hooks or layout hydration.
- Agent/session identity drift: hook, process, launch, and title evidence can
  disagree temporarily.
- Renderer/GPU crash containment: renderer fallback must still protect the known
  Gemini path without letting cwd text disable WebGL elsewhere.
- SSH/remote provider contracts: remote panes may lack local foreground-process
  evidence and must preserve title fallback without promoting stale local-only
  assumptions.
- Persistence/sleep: preserved titles must not resurrect working/permission state
  without live PTY or fresh explicit rows.

Required invariant checks:

- A stale title cannot override fresh hook/process identity.
- A title emitted by one split pane cannot change another pane's owner/status.
- A slept tab with preserved title cannot contribute to count/status/smart sort
  until liveness returns.
- A remote pane without foreground-process evidence still gets safe fallback
  behavior, but with fallback confidence.
- Renderer fallback changes only when the resolved renderer policy changes.

Existing gates to reuse:

- `pty-connection.test.ts` for title event routing, renderer policy, and owner-aware
  normalization.
- `use-tab-agent.test.ts` for precedence and launch-agent clearing.
- `worktree-status.test.ts`, `agent-status-count.test.ts`, and smart-attention
  tests for aggregate status.
- `running-agent-targets.test.ts` and `active-agent-note-send.test.ts` for send
  target eligibility and runtime verification.

Accepted gap for the planning PR:

- This branch writes the plan only; it does not implement the resolver or run live
  Electron/SSH/manual validation. The implementation PRs must not claim readiness
  until their relevant reliability gates and manual matrix have run or been
  explicitly accepted.

## Validation Plan

### Automated Tests

- `src/shared/agent-detection.test.ts` or successor title-evidence tests:
  cwd/session/repo names containing agent tokens do not imply ownership.
- `src/renderer/src/components/terminal-pane/pty-connection.test.ts`:
  title frames update display/runtime title and renderer policy from the same
  resolver decision.
- `src/renderer/src/lib/use-tab-agent.test.ts`:
  hook, foreground process, launch identity, and title fallback precedence stays
  stable for local and remote-like panes.
- `src/renderer/src/lib/worktree-status.test.ts` and
  `src/renderer/src/lib/agent-status-count.test.ts`:
  split-pane aggregate status uses pane evidence and does not resurrect slept or
  stale working titles.
- `src/renderer/src/lib/running-agent-targets.test.ts` and
  `src/renderer/src/lib/active-agent-note-send.test.ts`:
  send targets are enabled by fresh explicit rows or verified live pane status,
  not by stale tab-title text.
- Native Chat tests:
  supported-agent toggle can use title fallback before hooks, but unsupported
  Gemini-like cwd text does not expose Native Chat.
- Workspace cleanup and Workspace Space tests:
  title fallback remains conservative only for live panes and does not double-count
  panes covered by fresh explicit rows.
- Prompt cache and synthetic-title tests:
  restored idle-title seeding and hook-title replacement preserve their current
  narrow behavior through the resolver.
- Renderer policy tests:
  OMP/Pi-compatible raw titles mentioning Gemini keep GPU enabled; genuine Gemini
  titles still choose the existing safe renderer path; user `auto`/`on`/`off` and
  context-loss states keep their current precedence.

### Manual Validation

Run a local desktop smoke matrix:

1. Start OMP/Pi with cwd or repo names containing `gemini`, `codex`, and `claude`.
   Confirm tab label, tab icon, sidebar status, and renderer behavior agree.
2. Start genuine Gemini. Confirm the tab label is Gemini and the existing renderer
   fallback still applies.
3. In a split tab, run one working agent and one idle shell. Focus both panes and
   confirm the tab label follows focus while sidebar/counts still aggregate both
   panes correctly.
4. Sleep and wake an agent tab with preserved titles. Confirm stale title evidence
   does not show a working agent unless the PTY/hook is live again.
5. Repeat one OMP/Pi and one Gemini scenario through SSH or a remote runtime path,
   where local foreground-process evidence may be absent.
6. Validate a hookless/manual agent path so title fallback still creates useful
   status and send-target hints.
7. Validate a stale hook row with a live pane title: the row may become eligible
   only when the pane mapping and runtime send verification agree.

### Performance Guardrail

Title events can churn quickly under spinners. The follow-up must not add polling,
subprocess inspection, extra IPC per title frame, unbounded scans, storage writes
for every raw frame, or new timers. The resolver should be pure, bounded, and run
only where title events already flow today.

## Non-Goals

- Do not rewrite terminal transport, xterm attachment, or PTY lifecycle as part of
  the first cleanup.
- Do not remove title fallback. Some legacy, remote, and unknown sessions still
  need it.
- Do not make the renderer policy depend on provider-specific product names in
  unrelated UI modules.
- Do not introduce a broad persisted migration until the resolver API has been
  proven locally.

## Risks, Ambiguities, And Non-Goals

- The desired end state is a safer evidence boundary, not removal of title
  heuristics. Removing title fallback would regress hookless, remote, and legacy
  agent sessions.
- The first implementation PR should be behavior-preserving except where it
  explicitly fixes precedence. If it changes sidebar ordering, send-target
  visibility, or sleep/wake behavior, that is a product change and needs its own
  validation evidence.
- The current OpenClaude title-over-hook shim is an intentional exception. The
  follow-up should either preserve it narrowly or replace it with a stronger
  explicit source; it should not silently remove it.
- Renderer policy may need a short-term compatibility branch for genuine Gemini
  before a richer capability model exists. That is acceptable if the branch
  consumes resolved owner/evidence rather than raw title text directly.
- Cross-platform foreground-process evidence is local-only today. Windows, Linux,
  macOS, SSH, WSL, and remote runtime paths must not be collapsed into one
  assumption.
- The plan does not choose exact file names beyond candidate module names. The
  implementation should follow concrete domain naming and avoid catch-all modules.

## Rollout Shape

Prefer two or three small PRs:

1. Resolver + renderer policy + `pty-connection.ts` call site.
2. Aggregate status/readiness consumers.
3. Module split and cleanup of old title-string predicates.

Each PR should include a short invariant statement in its description and a
focused test matrix. The first PR should be small enough to review against #7428:
the visible behavior should remain the same except that title text can no longer
override stronger owner evidence for renderer decisions.

Per-PR process checklist:

- Design review: compare the PR scope to this plan and the #7428 regression class.
- Completeness check: list every touched consumer intent and every intentionally
  deferred consumer.
- Headline behavior audit: state whether the PR implements, partially implements,
  or defers the relevant phase.
- Performance audit: inspect title-event hot paths for polling, IPC fanout,
  subprocess reads, store-write churn, timers, listener leaks, and unbounded scans.
- Code-review/fix loop: run at least one independent review pass over precedence,
  reliability gates, and tests.
- Merge-confidence validation: run the focused automated tests and the applicable
  manual matrix items for local, split-pane, sleep/wake, and SSH/remote behavior.
- Gap reporting: for any skipped platform/manual path, record owner, reason,
  risk, and when it must be closed.

## Appendix: Verified Baseline Inventory

Verified against the tree on 2026-07-05: every file, function, store map, and
test gate named in this plan exists. Direct non-test call sites of the gated
predicates, grouped by consumer intent, for the Phase 2 audit to diff against:

- `detectAgentStatusFromTitle` (defined in `src/shared/agent-detection.ts`,
  re-exported by `src/renderer/src/lib/agent-status.ts`):
  - status: `agent-status.ts`, `worktree-status.ts`, `worktree-card-status.ts`,
    `smart-attention.ts`, `workspace-space-presentation.ts`, the `terminals.ts`
    store slice, `src/main/stats/agent-detector.ts`, and
    `src/main/runtime/orca-runtime.ts`;
  - identity: `agent-title-owner.ts`, `title-agent-identity.ts`,
    `worktree-title-derived-agent-rows.ts`;
  - safety: `workspace-cleanup.ts`;
  - timer: `cache-timer-seeding.ts`;
  - display: `terminal-helpers.ts`, `agent-status-terminal-title.ts`;
  - send/readiness: `agent-ready-wait.ts`, `active-agent-note-target.ts`,
    `agent-send-title-status.ts` (feeds `deriveRunningAgentSendTargets`);
  - transport/completion (expected allowlist survivors): `pty-transport.ts`,
    `pty-connection.ts`, `agent-completion-coordinator.ts`,
    `agent-decorative-title-signature.ts`.
- `getAgentLabel` (the `agent-detection.ts` title predicate only; see the
  name-collision caveat above): `agent-title-owner.ts`,
  `terminal-title-agent-type.ts`, `active-agent-note-target.ts`,
  `agent-status.ts`, `agent-send-title-status.ts`,
  `worktree-title-derived-agent-rows.ts`.
- `resolveExplicitTerminalTitleAgentType`: `use-tab-agent.ts`,
  `use-notification-dispatch.ts`, and
  `mobile/src/session/mobile-terminal-tab-agent.ts`. Mobile is a standalone
  package, so the Phase 3 module split must keep the mobile consumer's import
  path or copy in sync.
- `resolveTabAgentFromTitle` (alias of the above via `use-tab-agent.ts`):
  `TabBar.tsx`, `native-chat-leaf-title-agent.ts`,
  `use-native-chat-toggle-shortcut.ts`.
- `isGeminiTerminalTitle`: `pty-connection.ts` GPU toggle (the single Phase 3
  renderer-policy retirement target) and `title-agent-identity.ts` (identity
  use; stays with the identity domain).
