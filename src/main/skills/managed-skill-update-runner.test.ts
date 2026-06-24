import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_SKILL_NAME } from '../../shared/agent-feature-install-commands'
import { createManagedSkillUpdateRunner } from './managed-skill-update-runner'

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

class FakeChildProcess extends EventEmitter {
  readonly kill = vi.fn()
  readonly unref = vi.fn()

  constructor(readonly pid?: number) {
    super()
  }
}

describe('createManagedSkillUpdateRunner', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(spawn).mockReset()
  })

  it('resolves timeout without waiting for the child close event', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess()
    vi.mocked(spawn).mockReturnValue(child as never)
    const runner = createManagedSkillUpdateRunner({ timeoutMs: 50 })

    const resultPromise = runner(ORCHESTRATION_SKILL_NAME)
    await vi.advanceTimersByTimeAsync(50)

    await expect(resultPromise).resolves.toEqual({ status: 'timeout' })
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('kills the process when the shutdown signal aborts', async () => {
    const child = new FakeChildProcess()
    vi.mocked(spawn).mockReturnValue(child as never)
    const controller = new AbortController()
    const runner = createManagedSkillUpdateRunner({ signal: controller.signal, timeoutMs: 1_000 })

    const resultPromise = runner(ORCHESTRATION_SKILL_NAME)
    controller.abort()

    await expect(resultPromise).resolves.toEqual({ status: 'failure', error: 'aborted' })
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('spawns the single-skill global update command without a shell from a neutral cwd', async () => {
    const child = new FakeChildProcess()
    vi.mocked(spawn).mockReturnValue(child as never)
    const runner = createManagedSkillUpdateRunner({ cwd: '/home/alice', timeoutMs: 1_000 })

    const resultPromise = runner(ORCHESTRATION_SKILL_NAME)
    child.emit('close', 0)

    await expect(resultPromise).resolves.toEqual({ status: 'success' })
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['--yes', 'skills', 'update', 'orchestration', '--global', '--yes'],
      {
        cwd: '/home/alice',
        shell: false,
        stdio: 'ignore',
        windowsHide: true
      }
    )
  })

  it('uses taskkill for Windows process-tree cleanup on timeout', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess(123)
    const killer = new FakeChildProcess()
    vi.mocked(spawn)
      .mockReturnValueOnce(child as never)
      .mockReturnValueOnce(killer as never)
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const runner = createManagedSkillUpdateRunner({ timeoutMs: 50 })

    const resultPromise = runner(ORCHESTRATION_SKILL_NAME)
    await vi.advanceTimersByTimeAsync(50)

    await expect(resultPromise).resolves.toEqual({ status: 'timeout' })
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'taskkill',
      ['/pid', '123', '/t', '/f'],
      expect.objectContaining({ stdio: 'ignore', windowsHide: true })
    )
    expect(killer.unref).toHaveBeenCalledTimes(1)
    platform.mockRestore()
  })
})
