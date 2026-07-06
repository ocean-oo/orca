import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('detectAgentHookCliPresence shell PATH timeout', () => {
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.PATH = originalPath
    vi.useRealTimers()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it.runIf(process.platform !== 'win32')(
    'force-kills the login shell probe when it exceeds the SSH startup budget',
    async () => {
      vi.useFakeTimers()
      const stdout = new EventEmitter()
      const kill = vi.fn()
      const child = Object.assign(new EventEmitter(), {
        kill,
        stdout
      })

      vi.doMock('node:child_process', () => ({
        spawn: vi.fn(() => child)
      }))
      vi.doMock('./pty-shell-utils', () => ({
        resolveDefaultShell: () => '/bin/zsh'
      }))

      process.env.PATH = ''
      const { detectAgentHookCliPresence } = await import('./agent-hook-cli-presence')
      const responsePromise = detectAgentHookCliPresence({ agents: ['codex'] })

      await vi.advanceTimersByTimeAsync(5000)

      await expect(responsePromise).resolves.toEqual({
        presence: { codex: { state: 'missing' } }
      })
      expect(kill).toHaveBeenCalledWith('SIGKILL')
      expect(stdout.listenerCount('data')).toBe(0)
      expect(child.listenerCount('error')).toBe(0)
      expect(child.listenerCount('close')).toBe(0)
    }
  )
})
