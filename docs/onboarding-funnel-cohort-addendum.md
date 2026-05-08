# Onboarding Funnel — Cohort Addendum

Addendum to [`onboarding-funnel-telemetry.md`](./onboarding-funnel-telemetry.md). Adds cohort dimensionality to the events shipping in Phase 1 (and recommends extending several existing events for symmetry). No new events; only new properties.

## Goal

Make the funnel queryable by user cohort, not just by event sequence. The headline product question is "where do **new** users drop off?" — not "where do users drop off." The current schema cannot answer the first question without a multi-step session join through every user's full history, because every event fires identically for first-time users and for someone adding their 6th repo.

A first-time user clicking Skip on the Setup step is "I don't understand what to do here." A returning user with 5 repos clicking Skip is "I'll set this up later." These are not the same UX problem and shouldn't be averaged together. Today they are.

## Non-goals

- Not adding session-start or session-age events. App-session boundaries are already inferable from `app_opened` plus the device clock; a dedicated event would duplicate work.
- Not adding time-on-step instrumentation. The funnel is about transitions, not dwell. Dwell is a separate question with a separate cost (clocks, idle detection, pause-vs-active state).
- Not adding a synthetic `onboarding_complete` event. That state is `first agent_started for distinct_id` and is computable in PostHog without a new event.
- Not materializing person profiles. `$process_person_profile: false` (`client.ts:299-307`) stays as-is; cohort signal travels on the event, not the person record.

## The cohort signal

One integer, computed at emit time from local state the main process already has:

### `nth_repo_added: number`

The count of repos the user has at the moment the event fires — read from `store.getRepos().length`. The rule is single and consistent: the value reflects current store state at emit time. On `repo_added` the read happens *after* the add lands, so the user's Nth repo addition emits `N` (the just-landed write is included). On every other event, the same read returns whatever the count is — including `0` for a brand-new user on `app_opened` who has never added a repo.

That `0` is not a bug, not a sentinel, and not "undefined." It is the canonical **session-zero / pre-repo cohort** signal: a user who has launched the app but has not yet added their first repo. Filtering `nth_repo_added = 0` on `app_opened` isolates exactly that cohort. Filtering `nth_repo_added = 1` on `repo_added` (or any downstream event) isolates the just-onboarded "first repo ever" cohort. Filtering `nth_repo_added >= 1` excludes the pre-repo population entirely — which is sometimes what you want and sometimes a foot-gun, so the SQL section calls out the distinction.

This carries strictly more information than a `is_first_repo: boolean` would (`is_first === nth === 1`) at the same per-event cost, and it avoids the constant-boolean trap: there are events on which "is first" is structurally always one value and therefore useless for cohort splits. Ordinals avoid the trap because the value tracks state instead of asserting a predicate.

`nth_repo_added = 1` is the canonical "new user" filter for the post-first-repo funnel: a first-time user clicking Skip emits `add_repo_setup_step_action` with `nth_repo_added: 1`; a returning user emits the same event with `nth_repo_added > 1`. That single column splits the ~60% drop into the two cohorts the parent doc calls out. For pre-repo questions ("how many sessions never get to repo_added?"), use `nth_repo_added = 0` on `app_opened`.

## Why ordinals, not booleans or buckets

A boolean (`is_first_repo: true`) is a strict subset of an ordinal (`is_first === nth === 1`) at the same per-event cost. The boolean shape was rejected because:

- **Constant-on-event trap.** A `is_first_workspace` boolean on `repo_added` is structurally always `true` (workspaces require repos), and a `is_first_repo` boolean on `workspace_create_failed` is structurally always `false` (you cannot fail to create a workspace without already having a repo). A constant column is worse than no column: it invites incorrect cohort splits ("filter `is_first_workspace=true` on `repo_added` to find first-time users" — that filter is a no-op).
- **Booleans answer one question; ordinals answer the family.** "Is this the user's first repo?" and "is this their second?" and "is this their tenth?" are the same product question at different cohorts. Encoding the cohort as `nth` lets every analyst question be `WHERE nth_repo_added = N`; encoding as a boolean forces a new column for every new cohort question.

A bucketed enum (`'1' | '2_4' | '5_plus'`) was also rejected. The bucket boundaries are a code-review decision the author has to defend ("why is `5_plus` the boundary?"), and the bucketing is irreversible without a schema migration. An integer carries strictly more information than the bucket and pushes the bucketing decision to query time, where it's revisable.

A PostHog person-property approach (`$set_once: { first_repo_added_at: <ts> }`) was considered and rejected for this addendum because it requires flipping `$process_person_profile: true` (currently `false` at `client.ts:299-307`), which is a deliberate privacy posture inherited from the parent doc. If that posture changes, person properties become the right shape and this ordinal becomes redundant; until then, the ordinal lives on the event.

## Why we deferred `nth_workspace`

An earlier draft of this addendum proposed a second ordinal — `nth_workspace`, the 1-indexed count of workspaces the user has successfully created in Orca — paired with a persisted counter (`createdWorkspaceCount`), a `createdInOrca: boolean` flag on `WorktreeMeta`, and a read-before-delete invariant in all three branches of `worktrees:remove`. We dropped it. The reasoning is worth recording so the next reviewer doesn't rederive it.

Walking the headline analyst questions against `nth_repo_added` alone:

| Question | Answered with `nth_repo_added` alone? |
|---|---|
| Setup-step Skip cohort split (the ~60% drop) | Yes — `WHERE nth_repo_added = 1`. |
| `workspace_create_failed` cohort split (SSH-permission vs path-collision priority) | Yes — `GROUP BY CASE WHEN nth_repo_added = 1 THEN 'new' ELSE 'returning' END`. |
| `agent_error` cohort split (binary-not-found onboarding blocker vs env regression) | Yes — same shape. |
| First-repo → first-agent completion funnel | Yes, and already CTE-shaped because "first event per user" is intrinsically a window question; not regressed by dropping `nth_workspace`. |
| Onboarding-completion signal that *was* `nth_workspace = 1` | Reframed as `MIN(timestamp) WHERE event = 'workspace_created'` filtered to users with `nth_repo_added = 1`. |
| "Has a repo, no workspace" stuck cohort | Reframed as a funnel question ("users who emit `repo_added` but never `workspace_created`"), not a state question. |

The questions `nth_workspace` would uniquely answer — point-in-time "currently mid-conversion" without a window — are either already window-shaped (so the cohort property doesn't save the query) or speculative product asks not validated by Phase 1 data.

The cost we avoided by dropping it: a new persisted integer field (`createdWorkspaceCount`), three accessors (`get`/`increment`/`decrement`), a new `createdInOrca: boolean` on every `WorktreeMeta` (for symmetric decrement on remove), a read-before-delete invariant in three `worktrees:remove` branches (SSH, orphan-cleanup, normal — a naive write-then-read drifts the count upward), the post-upgrade undercount story for legacy installs whose existing in-Orca workspaces predate the flag, and the atomicity story for "what if increment lands but track() never fires." None of that is conceptually hard; all of it is state-drift surface area we have no validated demand for.

We also rejected going further — deferring cohort entirely (Alt C, "compute cohort in PostHog dashboards via window function") — because grep-visibility matters. `nth_repo_added = 1` is a code-reviewable filter that lives in one place and travels with the event; a window-function cohort definition lives in dashboard config, off-repo, where it can drift across queries without anyone noticing. Shipping `nth_repo_added` keeps the cohort definition in one auditable location.

`nth_workspace` is additive-safe. If Phase 1 data shows the speculative "currently mid-conversion" questions are real, high-value, and not adequately served by funnel-shaped queries on `nth_repo_added` + `workspace_created` timestamps, we add `nth_workspace` then. The inverse — building it now and finding out it didn't matter — is wasted code that we can't easily remove because dashboards will already depend on it.

## Where the classifier lives

The cohort value comes from a single module — **`src/main/telemetry/cohort-classifier.ts`** — that exposes:

```ts
function getCohortAtEmit(): {
  nth_repo_added: number | undefined
}
```

This module is the single source of truth for cohort state. `nth_repo_added` comes from `store.getRepos().length` (`persistence.ts`). The repo array is sync-loaded from persisted JSON at startup; every `repo_added` adds exactly one entry; deletions decrement.

- **Main-side emit sites** (the `emitRepoAdded` helper at `repos.ts:41`, `worktrees.ts:176` and `:191`, `pty.ts:1084` for `agent_started`, the `app_opened` heartbeat in `client.ts`) call `getCohortAtEmit()` directly before `track()`.
- **Renderer-side emit sites** (the four pure-UI Setup-step actions: `skip` / `configure` / `open_existing` / `back` in `AddRepoDialog.tsx`, plus the paste-readiness-timeout `agent_error` fallback at `src/renderer/src/lib/launch-work-item-direct.ts:160`) do NOT fetch cohort themselves. The `telemetry:track` IPC handler (`src/main/ipc/telemetry.ts:102-123`) calls `getCohortAtEmit()` at handler entry and merges `nth_repo_added` into the props object **only when the event name is in a `COHORT_EXTENDED` set co-located with the table below**, then invokes `track()`. The selectivity is load-bearing: the existing event schemas use `.strict()` Zod (see "Privacy guardrails"), so injecting `nth_repo_added` on a non-cohort event (e.g., a future renderer-originated `funnel_step` step that we haven't added cohort to) would cause the validator to silently drop the entire event. The set is declared as `const COHORT_EXTENDED = [...] as const satisfies readonly EventName[]`, co-located with the property table. The `satisfies` clause catches **one** drift direction: a name in `COHORT_EXTENDED` that isn't a valid `EventName` is a TypeScript error. It does **not** catch the more dangerous direction — a schema that declares `nth_repo_added` on an event whose name is missing from `COHORT_EXTENDED`, which would silently ship cohort-less events from the renderer. That direction is caught only by the schema-additions checklist co-located with the property table below and a review-time grep when adding new cohort events. The load-bearing invariant is the checklist, not the `satisfies` clause. (A future hardening could derive the set at runtime from `Object.keys(eventSchemas).filter(name => 'nth_repo_added' in eventSchemas[name].shape)`, but for one cohort property the manual list is fine.) This keeps the renderer call sites synchronous (matching the existing fire-and-forget `track()` shape at `src/renderer/src/lib/telemetry.ts:50-65`) and avoids an extra IPC round-trip.

Cost: `getCohortAtEmit()` is a synchronous read of one array length (`store.getRepos().length`). No subprocess, no IPC, no I/O.

### Failure modes

`getCohortAtEmit()` **never throws**. On any read error or store-not-yet-initialized condition, it returns `{ nth_repo_added: undefined }`. The schema (next section) declares the field `.optional()`, so an event with undefined cohort still validates and emits — it just lands without the cohort property. The pre-rollout-data dashboard handling described in *Privacy guardrails* below applies identically to undefined-cohort events.

This preserves the telemetry rule "must never crash the app" (the same invariant that motivates the silent-drop validator behavior at `client.ts:455`). A telemetry classifier failure on a critical user path (`onSkip`, `onConfigure`) is silent, not fatal.

The fail-soft path emits a single `console.warn('[telemetry-cohort] classifier returned undefined', { reason })` per session (gated by a session-scoped flag analogous to `appOpenedTrackedThisSession` at `client.ts:98`) so that "why is some chunk of last week's data missing `nth_repo_added`?" has a debug breadcrumb. No new event, no schema change. If the warns reveal a sustained degradation pattern, a future addition could promote it to a `cohort_degraded_session` common-prop boolean — but not preemptively.

In practice the persisted state is sync-loaded into the `Store` constructor *before* `initTelemetry`, and `app_opened` only fires from the main window's `did-finish-load`, so the store is hydrated before the first emit. The undefined-cohort path is for genuine read errors (corrupt JSON, disk fault), not for a routine cold start — so a sustained pattern of degraded-mode `console.warn` logs in production should be investigated, not dismissed as expected boot behavior.

### Read-vs-write ordering

The single read-vs-write hazard is on `repo_added`. The `emitRepoAdded` helper at `repos.ts:41` must call the classifier **after** `store.addRepo()` lands so the just-added repo is included in the count; otherwise the user's Nth `repo_added` would emit `N-1` and collide with the session-zero meaning of `0` (an `app_opened` for a user with no repos). The headline "new user" filter `nth_repo_added = 1` would then exclude the actual first-ever repo events. The helper is the single emit site, called from the success branches of `repos:add`, `repos:addRemote`, `repos:create`, and `repos:clone`; the duplicate-add short-circuit at `repos.ts:46-48` does not emit at all and so does not need cohort.

For every other extended event (`app_opened`, `workspace_created`, `workspace_create_failed`, `agent_started`, `agent_error`, `add_repo_setup_step_action`), the classifier reads at emit time with no special ordering — the repo count is not mutated by any of these call sites, so the read reflects current store state regardless.

## Where to add the property

I audited every event in `telemetry-events.ts:245-260`. The table below covers all events that touch the onboarding journey or whose failure modes plausibly skew by cohort. Events that don't (`settings_changed`, `telemetry_opted_in`, `telemetry_opted_out`) are deliberately excluded — see "Events deliberately not extended" below.

| Event | `nth_repo_added` | Rationale |
|---|---|---|
| `app_opened` (existing) | yes | Session heartbeat. Lets us answer "what fraction of sessions are by users on their first repo?" without a window function. **`nth_repo_added: 0` on `app_opened` is the meaningful pre-repo / session-zero cohort** — a user who has launched but never added a repo. Don't filter it out by default. |
| `repo_added` (existing) | yes | Post-add value tells us what wave of adds this is. `nth_repo_added = 1` is the canonical "first repo ever" anchor for downstream funnel queries. |
| `add_repo_setup_step_action` (Phase 1) | yes | Which Setup-step action does each cohort take? Headline diagnostic for the 60% drop. `nth_repo_added = 1` Skip vs `nth_repo_added > 1` Skip is a different UX problem with different fixes. |
| `workspace_created` (existing) | yes | Lets the onboarding-completion signal be expressed as "first `workspace_created` for a user whose `repo_added` carried `nth_repo_added: 1`." |
| `workspace_create_failed` (Phase 1) | yes | Failure modes likely skew by cohort — first-time users (`nth_repo_added = 1`) hit `permission_denied` (misconfigured SSH); power users hit `path_collision` (naming conflicts). Same enum value, completely different priority. |
| `agent_started` (existing) | yes | End of the onboarding funnel. Filtering to `nth_repo_added = 1` isolates the canonical "user just completed onboarding" cohort. |
| `agent_error` (existing) | yes | First-time users hitting `binary_not_found` is an onboarding blocker (CLI not installed); power users hitting it is an environment regression. Same enum value, completely different priority — cohort split is what disambiguates. |

Total: 7 events × 1 property = 7 property additions. Five of those events already exist; two ship in Phase 1.

Adding a property to existing events is additive-safe per the schema-evolution doctrine in `telemetry-events.ts:238-244`. Historical events have this property as `undefined`; dashboards built on the new field naturally exclude pre-rollout data, which is correct (we don't have ground truth on cohort for pre-rollout users anyway).

The Zod schema for the field is `z.number().int().nonnegative().optional()`. `.optional()` lets the classifier's fail-soft fallback (returning `undefined`) validate cleanly; `.int().nonnegative()` constrains malformed values to the floor.

### Events deliberately not extended

- **`settings_changed`** — settings activity isn't onboarding-specific. A first-time user flipping `experimentalAgentDashboard` and a power user flipping the same toggle are answering different questions, but the cohort dimension doesn't change *what* we'd do with the data. Skip until proven necessary.
- **`telemetry_opted_in` / `telemetry_opted_out`** — opt cohort skew is interesting but orthogonal to onboarding flow. Adding the ordinal here would also be slightly self-referential (the consent toggle deciding whether to tag itself). Skip.

## Privacy guardrails

- **Integer, not measurement.** `nth_repo_added: 47` on a single event is not a fingerprint. Identification from this field would require external knowledge that a *specific* person has ~47 Orca repos — not a credible threat model. The genuine PII risks remain paths, URLs, display names, branch names, and free-text errors; those continue to be excluded by the existing `.strict()` schema discipline (`telemetry-events.ts:142-148`) and the parent doc's "Properties to keep off these events" section.
- **No retroactive backfill.** Historical events keep `nth_repo_added: undefined`. The dashboard treats undefined as "unknown cohort," not as zero. We do not run a migration to label past events.
- **No person-profile materialization.** `$process_person_profile: false` (`client.ts:299-307`) stays as-is. The cohort signal travels on the event, not the user record. This is the central reason we picked an event ordinal over PostHog person properties — see "Why ordinals, not booleans or buckets."
- **Single classifier, single source.** The cohort value comes from `cohort-classifier.ts` reading main's store. The renderer's React-state cache is never the source. This eliminates the "two-sources-of-truth" hazard where the same value is computed differently by different emit sites.

The property is subject to the same `.strict()` Zod schema enforcement as everything else; an event with a non-integer cohort claim, or a cohort property the schema doesn't declare, would be dropped by the validator.

## SQL once this lands

**The headline question — first-repo-cohort Setup-step funnel:**

```sql
SELECT
  properties.action,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'add_repo_setup_step_action'
  AND properties.nth_repo_added = 1
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY properties.action
ORDER BY users DESC
```

The headline product question — "where do new users drop off?" — is a *user* metric, so the default reading is `count(DISTINCT distinct_id)`. `count(*)` would answer a subtly different question ("of all first-repo Setup-step *decisions*, what fraction were Skip?"), which differs from the user metric in two ways: a single user can hit Setup multiple times in one session (Add → Back → Add → Skip), and re-onboarding (see Open questions) legitimately re-emits with `nth_repo_added = 1`. Both framings are valid; the user count is what the headline question asks.

**Cohort-split workspace creation success rate:**

```sql
SELECT
  CASE
    WHEN properties.nth_repo_added IS NULL THEN 'unknown'
    WHEN properties.nth_repo_added = 1 THEN 'first_repo'
    ELSE 'returning'
  END AS cohort,
  countIf(event = 'workspace_created') AS ok,
  countIf(event = 'workspace_create_failed') AS fail,
  ok / (ok + fail) AS success_rate
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY cohort
```

The explicit `unknown` branch preserves the *Privacy guardrails* invariant: pre-rollout events (no property at all) and classifier-degraded events (the fail-soft `undefined` path in §"Failure modes") both land in `unknown` instead of being silently lumped into `returning` — which would otherwise inflate the returning-cohort denominator with users we have no cohort information for. As an alternative, dashboards that don't want to expose the unknown bucket can floor the query with `WHERE timestamp > <rollout_date>`. Note that this query intentionally counts *attempts* (`countIf` of events), not users — the success rate is per-attempt; switching to `count(DISTINCT distinct_id)` would change it to "fraction of users who ever succeeded," which is a different metric.

**"Has a repo, no workspace" stuck-cohort size — reframed as a funnel question:**

```sql
WITH first_repo AS (
  SELECT distinct_id, min(timestamp) AS t0
  FROM events
  WHERE event = 'repo_added' AND properties.nth_repo_added = 1
    AND timestamp > now() - INTERVAL 7 DAY
  GROUP BY distinct_id
),
first_workspace AS (
  SELECT distinct_id, min(timestamp) AS t1
  FROM events
  WHERE event = 'workspace_created'
  GROUP BY distinct_id
)
SELECT count() AS stuck_users
FROM first_repo
LEFT JOIN first_workspace USING distinct_id
WHERE first_workspace.t1 IS NULL OR first_workspace.t1 > first_repo.t0 + INTERVAL 7 DAY
```

This counts new users who added their first repo in the window but hadn't created a workspace within 7 days. The `nth_repo_added = 1` filter is deliberate: `= 1` isolates the first-repo cohort (the users we're asking about), `>= 1` would include every repo-add event by anyone with at least one repo (the wrong denominator), and `= 0` would be nonsensical here since `repo_added` cannot fire without the just-added repo being counted. The earlier draft of this query used a point-in-time `nth_workspace = 0` filter on `app_opened`; reframing to a funnel question gives a stronger signal anyway (it counts users who actually got stuck, not users who happen to be mid-session).

**Onboarding completion rate (per-day cohort funnel from first repo to first agent):**

```sql
WITH first_repo AS (
  SELECT distinct_id, min(timestamp) AS t0
  FROM events
  WHERE event = 'repo_added' AND properties.nth_repo_added = 1
  GROUP BY distinct_id
),
first_agent AS (
  SELECT distinct_id, min(timestamp) AS t1
  FROM events
  WHERE event = 'agent_started'
  GROUP BY distinct_id
)
SELECT
  toDate(first_repo.t0) AS day,
  count() AS started,
  countIf(first_agent.t1 IS NOT NULL) AS completed,
  completed / started AS completion_rate
FROM first_repo
LEFT JOIN first_agent USING distinct_id
GROUP BY day
ORDER BY day
```

Note the asymmetric filtering: `first_repo` filters `nth_repo_added = 1` (cohort definition: the user's first repo), but `first_agent` does not. The cohort is already scoped by the LEFT JOIN against `first_repo`; filtering `first_agent` on `nth_repo_added = 1` would silently exclude users who added a second repo before launching their first agent — a normal and successful onboarding path that happens to emit `agent_started` with `nth_repo_added = 2`. The filter belongs on the cohort-defining CTE only, not on the completion-detecting CTE.

The ordinal doesn't eliminate window functions — the per-day cohort funnel above still uses CTEs because "first event per user" is intrinsically a window question, and so is "first workspace per user" in the stuck-cohort query. What the ordinal does eliminate is the need to *compute cohort membership* via window function at every query: "is this user a first-timer?" becomes a single column lookup (`nth_repo_added = 1`) instead of a `min(timestamp) OVER (PARTITION BY distinct_id)` join.

## Backward compatibility

Existing dashboards on `workspace_created`, `repo_added`, `agent_started` continue to work unchanged — the new property is optional and existing aggregations don't reference it. New cohort-aware dashboards naturally start at the rollout boundary.

The `nth_repo_added` value reads from the same persisted `repos` array that has been on disk since long before this addendum, so existing installs report a correct ordinal on first emit — no migration, no undercount. A user with five repos who upgrades and then adds a sixth correctly emits `nth_repo_added: 6`.

The `funnel_step` event sketched in the parent doc's deferred section should carry the same ordinal when it lands, for the same reasons. Add to the schema sketch — and add `funnel_step` to `COHORT_EXTENDED` in lockstep.

## Cost

Six of the seven cohort-extended events emit from main and need an explicit `getCohortAtEmit()` call: `app_opened` (`client.ts`), `repo_added` (the `emitRepoAdded` helper at `repos.ts:41`), `workspace_created` and `workspace_create_failed` (`worktrees.ts:176` and `:191` — two physical call sites for two events in the same file), `agent_started` (`pty.ts:1084`), and `agent_error` (main-side error paths). That's six events / six physical call sites at ~2 lines each (~12 LOC). The seventh event, `add_repo_setup_step_action`, is renderer-only; the renderer-fallback `agent_error` site shares the same path. Both cost zero extra lines at the call site because the `telemetry:track` IPC handler injects cohort automatically for events in `COHORT_EXTENDED`. Classifier module ~10 LOC, IPC handler delta (cohort injection + selectivity check) ~10 LOC, schema additions (`nth_repo_added` on 7 events) ~7 LOC. No persistence wiring — the value is derived from existing state. Total addendum ≈ 40 LOC over Phase 1's baseline.

## Rollout

Land alongside Phase 1. The marginal cost is small, and shipping cohort dimensionality after-the-fact means a window of Phase 1 data without it — exactly the data we'd want to slice.

## Open questions

- **Should we also add `is_first_session: boolean` (true on the user's very first `app_opened`)?** Probably yes, but it lives outside this addendum because it requires a session-tracking mechanism that doesn't exist today. Defer.
- **Re-onboarding semantics.** A user who deletes all repos and re-adds resets to `nth_repo_added: 1`. This is correct — they are in a re-onboarding state and the headline funnel question still applies. Dashboards that need a tiebreaker ("first-ever" rather than "any-first") already have one: `MIN(timestamp) GROUP BY distinct_id`. The example queries above already use this pattern.
- **Remote (SSH) repos** count toward `nth_repo_added` indistinguishably from local ones. The persisted store does not partition them, and adding a remote repo is a real activation event from the cohort perspective. If the funnel question later differentiates by repo locality, that's a separate property addition (`is_remote: boolean` on `repo_added`), not a change to this ordinal.
- **Capping the integer.** No cap is applied today. If long-tail values become a concern (analyst error from `nth_repo_added: 8000`, telemetry payload bloat from per-emit ordinals on a heavy user), introducing a `MIN(nth, 100)` clamp at the classifier is additive-safe — historical events with `nth > 100` would land uncapped, the validator accepts both. Defer until the data shows this matters.
