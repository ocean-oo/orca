# RESOLVED: Codex/agent terminal tab icon not showing

Branch: `fix-codex-icon-not-showing-up-on-terminal`. All fixes validated live
end-to-end on 2026-07-05 in an isolated dev instance (fresh profile + fresh
daemon, real clicks via playwright-cli, visible-icon screenshots).

## Root causes found (three, stacked)

1. **bash-preexec swallows Orca's OSC 133;C** (the original bug on this
   machine). The user's bash setup (iTerm2 shell integration) loads
   bash-preexec, which re-arms its own DEBUG trap at the first prompt,
   silencing Orca's `trap '__orca_osc133_preexec' DEBUG`. Result: typing
   `codex`/`grok` emits NO command-start signal, so foreground detection never
   begins. D (from PROMPT_COMMAND precmd) still fires at prompts, so panes get
   marked shell-foreground, which also suppresses the title-layer icon.
   Verified live: `trap -p DEBUG` showed `__bp_preexec_invoke_exec`.
   **Fix**: `shell-ready.ts` bash wrapper also registers
   `__orca_osc133_preexec_bp` in bash-preexec's `preexec_functions` array
   (gated on `__orca_in_command` so C fires exactly once either way).

2. **Daemon foreground cache TTL vs renderer retry cadence.** For node-wrapped
   CLIs (grok's `node /opt/homebrew/bin/grok` trampoline), the daemon resolves
   node→grok asynchronously into a 1000ms-TTL cache, but the renderer's wrapper
   retries fire at +1200/+3500ms — always after expiry — so every read returned
   raw `"node"` and detection failed. Verified live: reads alternated
   node/grok/grok/node at 700ms intervals.
   **Fix**: `pty-subprocess.ts` serves the last resolved identity while the
   foreground is still an unidentifiable wrapper (stale-while-revalidate), and
   clears an expired identity when a refresh proves the wrapper tree has no
   agent (so `npm` after an agent exit can't inherit the icon).

3. **Duplicate OSC 133;D defeats the confirming read.** User shell
   integrations double up Orca's 133 sequences: every D arrives twice ~50ms
   apart (verified via a PTY data tap: `D;0 … 53ms … D;0`). The second D saw no
   pending 'command' read (only the first D's pending 'command-finished' read),
   took the no-RPC fast path, published `{null, shellForeground: true}`, and
   cancelled the in-flight confirmation.
   **Fix**: `pane-foreground-agent-tracker.ts` counts a pending/in-flight
   confirming read as "read pending", so duplicate Ds re-confirm.

Plus two renderer resilience fixes for "focused pane changes" (user report):

4. **Enter-triggered sampling** (`pty-connection.ts` onTerminalKeyDown): Enter
   at a shell-foreground pane triggers the existing self-limiting foreground
   sample — covers any setup where no 133;C arrives at all. Publishes nothing
   for idle shells; skipped when an agent identity is already live.
5. **Focus-change resampling** (`use-terminal-pane-lifecycle.ts`
   onActivePaneChange → `sampleForegroundAgentOnFocus`): the tab icon follows
   the active leaf, so focusing a shell-marked pane whose agent is still
   running re-samples it (recovers poisoned entries in splits).

## Validated live (fresh build, new tabs, real clicks)

- Typed `grok` in an already-focused pane → entry `{agent:'grok'}` + grok icon
  on the tab within ~6s.
- Split right + typed `codex` → both panes' entries correct
  (`{agent:'grok'}` / `{agent:'codex'}`); tab icon follows the focused pane
  (grok icon ↔ codex icon on click), screenshots confirmed.
- Quit codex → entry cleared, tab shows plain terminal icon for the shell
  pane; grok icon returns when its pane regains focus.

## Tests

- `shell-ready.test.ts` 23/23 (new: bash-preexec re-arm regression test that
  fails without fix 1).
- `pty-subprocess.test.ts` 85/85 (new: stale-serve past TTL + expired-identity
  clear).
- `pane-foreground-agent-tracker.test.ts` 23/23 (new: duplicate-D pair
  confirm + idle-pane duplicate-D no-RPC path).
- `tsgo` web + node configs clean, oxlint clean.
- KNOWN: `pty-connection.test.ts` cannot load on this branch (pre-existing
  vite resolution error for `pane-terminal-foreground-render-settle`; rebase
  onto main to run its added tests).

## Notes for review/merge

- `CODEX_ICON_DEBUG.diff` is stale (pre-dates these fixes); use `git diff`.
- The daemon is a long-lived process: users (and dev instances) keep running
  the OLD daemon code until it restarts. The bash rcfile is rewritten at
  daemon startup, so fix 1 also needs a daemon restart to take effect.
- SSH panes are unaffected: the tracker's reads are gated by isTrackablePtyId
  (local only); the shell-side C fix benefits every OSC 133 consumer.
