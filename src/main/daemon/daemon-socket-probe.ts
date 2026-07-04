import { existsSync } from 'node:fs'
import { connect } from 'node:net'

export const DEFAULT_SOCKET_PROBE_TIMEOUT_MS = 1000

// Why: before spawning a new daemon, check if an existing one is alive by
// attempting a connection to the socket. If it connects, the daemon survived
// from a previous app session — reuse it instead of spawning. On Windows the
// endpoint is a named pipe with no filesystem presence, so there is no
// existsSync shortcut and a connect attempt is the only liveness signal.
export function probeSocket(
  socketPath: string,
  timeoutMs = DEFAULT_SOCKET_PROBE_TIMEOUT_MS
): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !existsSync(socketPath)) {
      resolve(false)
      return
    }
    const sock = connect({ path: socketPath })
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    function finish(alive: boolean, options?: { destroy?: boolean }): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      sock.removeListener('connect', onConnect)
      sock.removeListener('error', onError)
      if (options?.destroy) {
        sock.destroy()
      }
      resolve(alive)
    }

    function onConnect(): void {
      finish(true, { destroy: true })
    }

    function onError(): void {
      finish(false)
    }

    timer = setTimeout(() => {
      finish(false, { destroy: true })
    }, timeoutMs)
    sock.on('connect', onConnect)
    sock.on('error', onError)
  })
}
