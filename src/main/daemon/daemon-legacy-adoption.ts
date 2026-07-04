import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { DaemonPtyAdapter } from './daemon-pty-adapter'
import { getDaemonPidPath, getDaemonSocketPath, getDaemonTokenPath } from './daemon-spawner'
import { parseDaemonPidFile } from './daemon-health'
import { probeSocket } from './daemon-socket-probe'
import { PREVIOUS_DAEMON_PROTOCOL_VERSIONS } from './types'

// Why: right after an app update the machine is busy (installer teardown, AV
// scans) and Windows named-pipe connects can transiently fail or stall. A
// single 1s probe misclassifying a live previous-version daemon as dead used
// to permanently strand its sessions (the old code deleted the token file the
// adoption path needs). Retry before concluding anything, and only clean up
// files when the pid provably no longer runs.
export const LEGACY_ADOPTION_PROBE_TIMEOUT_MS = 2000
export const LEGACY_ADOPTION_PROBE_ATTEMPTS = 3
export const LEGACY_ADOPTION_RETRY_DELAY_MS = [250, 750]

export type LegacyDaemonAdoptionResult = {
  adapters: DaemonPtyAdapter[]
  /** Protocol versions whose on-disk files said a daemon may still be running
   *  but whose socket/pipe never accepted a connection. Sessions owned by
   *  those daemons cannot be adopted this launch. */
  unreachableVersions: number[]
}

type LegacyAdapterFactory = (opts: {
  socketPath: string
  tokenPath: string
  protocolVersion: number
  historyPath: string
}) => DaemonPtyAdapter

export type LegacyDaemonAdoptionOverrides = {
  probe?: (socketPath: string, timeoutMs?: number) => Promise<boolean>
  delay?: (ms: number) => Promise<void>
  createAdapter?: LegacyAdapterFactory
  protocolVersions?: readonly number[]
  isPidAlive?: (pid: number) => boolean
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readLegacyDaemonPid(pidPath: string): number | null {
  try {
    return parseDaemonPidFile(readFileSync(pidPath, 'utf8'))?.pid ?? null
  } catch {
    return null
  }
}

function removeDeadLegacyDaemonFiles(
  socketPath: string,
  tokenPath: string,
  pidPath: string
): void {
  // Why: dead legacy daemons leave pid/token files behind forever (one per
  // protocol bump). A stale pid eventually gets recycled by an unrelated
  // process, turning any future identity check into a PowerShell spawn.
  for (const stalePath of [pidPath, tokenPath]) {
    try {
      unlinkSync(stalePath)
    } catch {
      // Best-effort
    }
  }
  if (process.platform !== 'win32' && existsSync(socketPath)) {
    try {
      unlinkSync(socketPath)
    } catch {
      // Best-effort
    }
  }
}

// Why: old daemon PTYs can be running long-lived agents during an app
// upgrade. Keep those sessions routed to their original daemon while new
// terminals use the current protocol, instead of killing background work.
// Legacy adapters intentionally do not respawn: respawning an old protocol
// daemon from new code would recreate stale env semantics and can be less
// predictable than letting the session fail if that old daemon dies.
export async function adoptLegacyDaemons(
  runtimeDir: string,
  historyPath: string,
  overrides: LegacyDaemonAdoptionOverrides = {}
): Promise<LegacyDaemonAdoptionResult> {
  const probe = overrides.probe ?? probeSocket
  const delay = overrides.delay ?? defaultDelay
  const isPidAlive = overrides.isPidAlive ?? defaultIsPidAlive
  const createAdapter: LegacyAdapterFactory =
    overrides.createAdapter ?? ((opts) => new DaemonPtyAdapter(opts))
  const protocolVersions = overrides.protocolVersions ?? PREVIOUS_DAEMON_PROTOCOL_VERSIONS

  const adapters: DaemonPtyAdapter[] = []
  const unreachableVersions: number[] = []
  for (const protocolVersion of protocolVersions) {
    const socketPath = getDaemonSocketPath(runtimeDir, protocolVersion)
    const tokenPath = getDaemonTokenPath(runtimeDir, protocolVersion)
    const pidPath = getDaemonPidPath(runtimeDir, protocolVersion)

    // Why token presence is the retry signal: the token file is written when
    // a daemon for that protocol actually ran, and adoption cannot
    // authenticate without it — so it is both the "a daemon may still be
    // running" evidence and the precondition for adoption being useful.
    // Without it a single probe keeps startup fast across the legacy list.
    const tokenExists = existsSync(tokenPath)
    const attempts = tokenExists ? LEGACY_ADOPTION_PROBE_ATTEMPTS : 1

    let alive = false
    for (let attempt = 1; attempt <= attempts; attempt++) {
      alive = await probe(socketPath, tokenExists ? LEGACY_ADOPTION_PROBE_TIMEOUT_MS : undefined)
      if (alive) {
        if (attempt > 1) {
          console.warn(
            `[daemon] Previous-version daemon v${protocolVersion} accepted a connection on attempt ${attempt}/${attempts}`
          )
        }
        break
      }
      if (attempt < attempts) {
        await delay(
          LEGACY_ADOPTION_RETRY_DELAY_MS[
            Math.min(attempt - 1, LEGACY_ADOPTION_RETRY_DELAY_MS.length - 1)
          ]
        )
      }
    }

    if (!alive) {
      const pid = readLegacyDaemonPid(pidPath)
      if (pid !== null && isPidAlive(pid)) {
        // Why: a live pid with an unreachable pipe is exactly the transient
        // failure mode this launch cannot distinguish from a wedged daemon.
        // Deleting the token here would make adoption impossible forever, so
        // keep the files and let the next launch retry.
        if (tokenExists) {
          unreachableVersions.push(protocolVersion)
          console.error(
            `[daemon] Previous-version daemon v${protocolVersion} looks alive (pid ${pid}) but its socket/pipe refused ${attempts} connection attempts — its terminal sessions cannot be adopted this launch. Keeping its runtime files for the next launch.`
          )
        }
        continue
      }
      if (tokenExists || pid !== null) {
        console.warn(
          `[daemon] Previous-version daemon v${protocolVersion} is gone (stale pid/token files) — cleaning up`
        )
        removeDeadLegacyDaemonFiles(socketPath, tokenPath, pidPath)
      }
      continue
    }

    // Why historyPath is still passed: checkpoint writes will fail silently
    // (pre-v4 daemons don't support getSnapshot), but the HistoryManager is
    // still needed for cleanup — close/exit events must remove history dirs
    // and mark meta.json as ended. Without it, a later v4 session reusing
    // the same ID could false-restore stale scrollback.bin.
    adapters.push(createAdapter({ socketPath, tokenPath, protocolVersion, historyPath }))
  }
  return { adapters, unreachableVersions }
}
