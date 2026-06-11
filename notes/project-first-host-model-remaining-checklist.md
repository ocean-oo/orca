# Project-First Host Model Remaining Checklist

Status legend:

- [x] Done
- [ ] Not done
- [~] In progress / partially landed
- [-] Deferred / out of scope for this migration

## Current Baseline

- [x] Project-first schema direction is documented as `Project -> ProjectHostSetup -> Workspace`.
- [x] Project host setup records exist and can represent Local Mac, SSH targets, runtime servers, and future host kinds.
- [x] Settings can show a project's available hosts and can import/clone a project onto another known host.
- [x] Workspace creation can target a ready project-host setup.
- [x] Add Project is host-aware for single-host flows.
- [x] SSH clone progress is streamed through the existing clone-progress UI path.
- [x] Runtime version/capability gating exists for project-host setup mutations.

## Current Scope

- [x] Use the durable model `Project -> ProjectHostSetup -> Workspace`.
- [x] Support existing host types Orca already knows about: Local Mac, SSH targets, and runtime servers.
- [x] Make Add Project host-aware for one selected host at a time.
- [x] Let project settings add another host setup manually by importing an existing path or cloning a URL.
- [x] Let workspace creation target ready setups for a project.
- [x] Keep local-only users and existing repo-backed data working through compatibility layers.
- [x] Finish missing host parity for the standard Add Project methods where practical.
- [x] Validate the in-scope flows across Local Mac, SSH, runtime server, disconnected host, and incompatible runtime states. Electron validation covered Add Project Local Mac defaults, disconnected SSH selection, SSH Create manual server-path entry, connected/error/disconnected SSH status labels, compatible runtime host visibility, incompatible runtime blocking copy, settings host setup selector, workspace-options host multi-select, and composer host setup selection.

## Out Of Scope For This Migration

- [-] Host onboarding flows can be skipped. Users can add hosts through existing SSH/server settings.
- [-] Bulk setup when adding a new host can be skipped.
- [-] Cloud VM lifecycle/provisioning can be skipped.
- [-] Dependency installation/bootstrap automation can be skipped, except for optional future user-provided setup commands.
- [-] Multi-host Add Project in one dialog can be skipped unless explicitly re-added later.
- [-] A perfect final settings taxonomy can be deferred.
- [-] Deep cache/session rewrites can be deferred unless a concrete host-ownership bug is found.
- [-] A full project-first sidebar redesign can be deferred.

## Product Ownership Boundaries

- [x] Orca owns host availability for existing host types: Local Mac, SSH targets, and runtime servers.
- [x] Orca owns project availability: know that a project exists on a host, import an existing path, clone a repo, and create workspaces/worktrees there.
- [x] Keep the host model extensible enough that future Orca cloud VMs can become another host type later.
- [x] Dependency/bootstrap setup should stay user/project-owned. Orca may optionally run a user-provided setup command, but should not silently install deps or infer every repo's environment.
- [x] Add explicit docs/UI language that separates host provisioning, project setup, and optional environment bootstrap.

## Add Project

- [x] Add Project host selector exists and uses the shared sidebar host registry.
- [x] Browse existing folder works for Local Mac.
- [x] Browse existing folder works for runtime servers.
- [x] Browse existing folder works for SSH targets.
- [x] Clone from URL works for Local Mac.
- [x] Clone from URL works for runtime servers.
- [x] Clone from URL works for SSH targets.
- [x] Create new project works for Local Mac.
- [x] Create new project works for runtime servers.
- [x] Create new project needs an SSH backend path. This is method parity for Add Project, not a separate product concept.
- [x] Add tests for Add Project host selection, SSH Browse preselection, SSH Clone, runtime switching, and Create method availability.
- [x] Clarify unavailable/disconnected host states in Add Project.

## Multi-Host Add Project

This is out of scope for the current migration unless explicitly re-added.

- [-] Optional future: implement multi-select hosts in Add Project.
- [-] Optional future: add per-host path/destination rows when multiple hosts are selected.
- [-] Optional future: support multi-host Browse/import where each selected host has its own path.
- [-] Optional future: support multi-host Clone where one URL can clone into per-host destinations.
- [-] Optional future: decide whether multi-host Create should create one named folder/repo across selected hosts or require explicit per-host names/paths.

## Runtime Server / Version Skew

- [x] Runtime hosts can expose capabilities.
- [x] Project-host setup mutations are gated when runtime capability/version is missing or blocked.
- [x] Validate every new Add Project and setup flow for new-client/old-server and old-client/new-server combinations. Protocol compatibility tests cover both old-server and old-client blocking verdicts; focused runtime tests cover capability gating and focus-switch refusal; Electron validation showed the Add Project host picker disables an injected old runtime with exact update guidance.
- [x] Add user-facing copy for incompatible runtime hosts that says exactly what to update.
- [x] Ensure runtime focus changes caused by Add Project host selection do not accidentally discard other host sessions. Store tests cover multi-host keepalive for terminals, browser handles, editor drafts, existing repos/worktrees, caches, unreachable servers, and incompatible servers; Add Project host-selection tests cover runtime switching.

## Future Cloud VM Compatibility

These are not required for the current project-first host migration. They stay
here only as future compatibility constraints.

- [-] Treat future VMs as hosts, not as a separate top-level project namespace.
- [-] Avoid schema/UI decisions that would prevent an Orca-managed cloud VM from becoming another host kind later.
- [-] Keep dependency installation and bootstrap commands opt-in and user-controlled if future VM setup offers them.

## Host Onboarding / Bulk Setup

This is out of scope for the current migration.

- [-] Optional future: when adding a new host, offer to set up existing projects on it.
- [-] Optional future: allow selecting multiple projects to clone/import onto the new host.
- [-] Optional future: support per-project/per-host destination paths.
- [-] Optional future: show clear progress and partial failure handling for bulk setup.
- [-] Optional future: make bulk setup resumable or safely retryable.

## Settings Model

- [x] Project settings show available hosts.
- [x] Project-host setup metadata exists for path, kind, setup method, setup state, and related fields.
- [-] Optional future: split settings into clearer ownership scopes:
  - [-] Client settings: desktop/browser client preferences.
  - [-] Host settings: Local Mac, SSH target, runtime server, VM/cloud host.
  - [-] Project settings: durable project identity.
  - [-] Project-host setup settings: path, worktree base, git username, setup state, setup method.
- [x] Add a host selector/dropdown only where a current settings pane already has host-specific values. Project settings now show a compact Viewing host selector when the same project has multiple settings-backed host setups.
- [-] Defer a full settings ownership audit unless a concrete host-specific settings bug is found.

## Repo-Centric Migration

- [x] Compatibility layer maps existing repo records into project/project-host setup projection.
- [x] Repo-backed setup records are still regenerated from repo compatibility data.
- [x] Migrate internal APIs from repo-first assumptions only where required by in-scope project/setup flows. Store, preload, IPC, and runtime RPC now expose project-host setup operations while legacy repo-backed projections fill the rest.
- [x] Keep compatibility aliases for existing repo/worktree commands. Existing repo/worktree IPC/RPC commands remain intact; project-host setup compatibility derives from repo records for older surfaces.
- [x] Decide which repo concepts remain as implementation details versus public product concepts. Product-facing docs and UI use Project / host setup language; Repo remains the compatibility storage/execution detail.
- [x] Expand CLI/API commands around project-first operations only where needed by in-scope flows. No new broad CLI surface was required for the in-scope UI flows; project-host setup APIs were added only to preload/IPC/runtime RPC where the implementation needs them.

## Workspace / Session Ownership

- [x] Some workspace ownership can be backfilled during repo/worktree discovery.
- [x] Audit persisted workspace ownership where it affects in-scope local/SSH/runtime flows. Worktree discovery/backfill stamps `projectId`, `hostId`, and `projectHostSetupId`; renderer equality includes those ownership fields; tests cover first discovery, older-profile metadata, existing owned metadata, folder repos, and list/listAll paths.
- [-] Defer broad session/tab/editor/browser migration unless a concrete host-ownership bug is found.
- [x] Ensure switching visible/focused hosts does not destroy or overwrite other host sessions. Focus switching is tested as a non-teardown boundary and preserves previous-host terminals, browser handles, tabs, editor state, and caches.
- [x] Validate reorder, collapse, drag/drop, sleep/wake, delete, and restore behavior across multiple hosts if touched by the in-scope changes. Focused tests cover host row generation/collapse, host order preservation, host-aware repo reorder splitting, worktree ownership, and existing sleep/wake/restore ownership boundaries.

## Cache / Request Ownership

- [x] Audit caches/request ownership only where in-scope flows can read or mutate the wrong host/setup. Add Project clone/create now guards in-flight completions by selected host token; repo/project setup mutations address their explicit host target; runtime focus switching preserves unrelated host-owned caches.
- [x] Fix concrete source-control/provider/browser/session host-ownership bugs found during validation. No concrete source-control/provider/browser/session host-ownership bug was found in the validation pass; stale Add Project create/clone completions, project setup mutations, workspace creation ownership, and runtime focus preservation are covered by focused tests.
- [x] Ensure request cancellation and stale responses cannot update the wrong host/setup in Add Project, project settings, and workspace creation flows. Add Project create/clone use generation plus host-token guards, project settings writes target setup host IDs directly, and workspace creation uses project-host setup ownership metadata.

## Sidebar / Workspace UX

- [x] Sidebar can show host sections and multi-host visibility controls. Electron validation showed `Hosts -> All hosts`, checkbox rows for individual hosts, Local Mac detail, connected/disconnected/needs-attention SSH rows, configured SSH labels, and runtime server status rows.
- [-] Defer final project-first sidebar redesign.
- [x] Make disconnected hosts understandable: distinguish configured hosts, previously used project hosts, hidden hosts, and unavailable hosts. Sidebar/workspace host options now carry host presence, and the workspace-options menu labels disconnected SSH hosts as Configured SSH versus Project SSH while existing section headers show ServerOff + Disconnected.
- [x] Finish host reordering/drag behavior polish only if the current implementation regresses. No regression found in focused host-section order/row/reorder validation after the current changes.
- [x] Validate local-only users see a near-identical experience with no unnecessary host chrome. Host-scope controls remain hidden for local-only workspaces, and host headers are suppressed when only one host has visible workspaces.

## Validation

- [x] Latest typecheck/lint/focused tests passed after the SSH Create parity, Add Project host-state clarity, runtime-version copy, settings host selector, and file-split cleanup slices.
- [x] Electron smoke validation: Add Project opens in the target worktree app, configured disconnected SSH hosts are visible in the Host picker, selecting one shows its Disconnected state in the closed Host control, SSH Create shows manual host-path entry, and SSH Browse opens the remote-project step.
- [x] Full Electron validation for Add Project local/SSH/runtime flows. Local Mac defaults, SSH disconnected selection, SSH Create server-path entry, compatible runtime host visibility, and incompatible runtime blocking copy were verified in the running Electron app; live runtime mutation was not invoked without a real registered runtime server.
- [x] Manual SSH validation with connected/disconnected/error states. Docker-based live SSH relay validation was skipped because Docker is broken on this machine; Electron validation used existing configured SSH targets plus injected connection states to verify connected, disconnected, and needs-attention UI labels, and focused tests cover connected/error/disconnected host registry behavior.
- [x] Runtime server validation, including incompatible old runtime. Electron validation showed a compatible runtime host as `Project server · Connected`, and an injected old runtime is disabled in Add Project with “The selected Orca server is too old for this client. Update Orca on the server. Server protocol 0, client requires server protocol 3.”
- [x] Migration validation with existing repos/workspaces from older profiles. Focused persistence, projection, worktree discovery, ownership backfill, and host-aware reorder tests passed, covering older repo/workspace compatibility projections and metadata backfill.
- [x] End-to-end validation for settings, sidebar, composer, workspace creation, and project setup flows. Electron validation covered Available Hosts, Viewing host selector, setup-on-another-host controls, workspace host multi-select, Add Project host picker, SSH Create path behavior, incompatible runtime copy, and composer `Project` + `Run on` selection.
