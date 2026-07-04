import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:net'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adoptLegacyDaemons } from './daemon-legacy-adoption'
import type { DaemonPtyAdapter } from './daemon-pty-adapter'
import {
  getDaemonPidPath,
  getDaemonSocketPath,
  getDaemonTokenPath,
  serializeDaemonPidFile
} from './daemon-spawner'

const LEGACY_VERSION = 17

type CreatedAdapter = {
  socketPath: string
  tokenPath: string
  protocolVersion: number
  historyPath: string
}

function stubAdapterFactory(created: CreatedAdapter[]) {
  return (opts: CreatedAdapter): DaemonPtyAdapter => {
    created.push(opts)
    return { protocolVersion: opts.protocolVersion } as unknown as DaemonPtyAdapter
  }
}

describe('adoptLegacyDaemons', () => {
  let dir: string
  let historyDir: string
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-legacy-adoption-test-'))
    historyDir = join(dir, 'history')
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
  })

  it('adopts a live previous-version daemon reachable on its socket', async () => {
    // Simulate a still-running pre-upgrade daemon: a real server listening on
    // the exact socket path the previous protocol version would use.
    const socketPath = getDaemonSocketPath(dir, LEGACY_VERSION)
    const server = await new Promise<Server>((resolve, reject) => {
      const created = createServer()
      created.once('error', reject)
      created.listen(socketPath, () => resolve(created))
    })
    writeFileSync(getDaemonTokenPath(dir, LEGACY_VERSION), 'token', 'utf8')

    try {
      const created: CreatedAdapter[] = []
      const result = await adoptLegacyDaemons(dir, historyDir, {
        protocolVersions: [LEGACY_VERSION],
        createAdapter: stubAdapterFactory(created)
      })

      expect(result.adapters).toHaveLength(1)
      expect(result.unreachableVersions).toEqual([])
      expect(created[0]).toMatchObject({
        socketPath,
        protocolVersion: LEGACY_VERSION,
        historyPath: historyDir
      })
      expect(existsSync(getDaemonTokenPath(dir, LEGACY_VERSION))).toBe(true)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('retries transient probe failures before adopting', async () => {
    writeFileSync(getDaemonTokenPath(dir, LEGACY_VERSION), 'token', 'utf8')
    let calls = 0
    const probe = vi.fn(async () => {
      calls += 1
      return calls >= 3
    })

    const created: CreatedAdapter[] = []
    const result = await adoptLegacyDaemons(dir, historyDir, {
      protocolVersions: [LEGACY_VERSION],
      probe,
      delay: async () => {},
      createAdapter: stubAdapterFactory(created)
    })

    expect(probe).toHaveBeenCalledTimes(3)
    expect(result.adapters).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 3/3'))
  })

  it('keeps token/pid files and logs loudly when the daemon pid is alive but unreachable', async () => {
    const tokenPath = getDaemonTokenPath(dir, LEGACY_VERSION)
    const pidPath = getDaemonPidPath(dir, LEGACY_VERSION)
    writeFileSync(tokenPath, 'token', 'utf8')
    writeFileSync(
      pidPath,
      serializeDaemonPidFile({ pid: process.pid, startedAtMs: null }),
      'utf8'
    )
    const probe = vi.fn(async () => false)

    const result = await adoptLegacyDaemons(dir, historyDir, {
      protocolVersions: [LEGACY_VERSION],
      probe,
      delay: async () => {},
      isPidAlive: () => true,
      createAdapter: stubAdapterFactory([])
    })

    expect(probe).toHaveBeenCalledTimes(3)
    expect(result.adapters).toHaveLength(0)
    expect(result.unreachableVersions).toEqual([LEGACY_VERSION])
    // The token file is the only credential that can ever adopt these
    // sessions — a transient failure must not delete it.
    expect(existsSync(tokenPath)).toBe(true)
    expect(existsSync(pidPath)).toBe(true)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Previous-version daemon v${LEGACY_VERSION} looks alive`)
    )
  })

  it('cleans up token/pid files when the daemon pid is provably dead', async () => {
    const tokenPath = getDaemonTokenPath(dir, LEGACY_VERSION)
    const pidPath = getDaemonPidPath(dir, LEGACY_VERSION)
    writeFileSync(tokenPath, 'token', 'utf8')
    writeFileSync(pidPath, serializeDaemonPidFile({ pid: 999999, startedAtMs: null }), 'utf8')

    const result = await adoptLegacyDaemons(dir, historyDir, {
      protocolVersions: [LEGACY_VERSION],
      probe: async () => false,
      delay: async () => {},
      isPidAlive: () => false,
      createAdapter: stubAdapterFactory([])
    })

    expect(result.adapters).toHaveLength(0)
    expect(result.unreachableVersions).toEqual([])
    expect(existsSync(tokenPath)).toBe(false)
    expect(existsSync(pidPath)).toBe(false)
  })

  it('probes once and stays quiet when no evidence files exist', async () => {
    const probe = vi.fn(async () => false)

    const result = await adoptLegacyDaemons(dir, historyDir, {
      protocolVersions: [LEGACY_VERSION],
      probe,
      delay: async () => {},
      createAdapter: stubAdapterFactory([])
    })

    expect(probe).toHaveBeenCalledTimes(1)
    expect(result.adapters).toHaveLength(0)
    expect(result.unreachableVersions).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
