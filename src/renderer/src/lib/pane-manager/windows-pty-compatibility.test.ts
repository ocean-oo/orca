import { describe, expect, it } from 'vitest'
import {
  buildWindowsPtyCompatibilityOptions,
  isLocalNativeWindowsPty,
  resolveWindowsShellOverride
} from './windows-pty-compatibility'

describe('buildWindowsPtyCompatibilityOptions', () => {
  it('returns ConPTY compatibility options for local Windows terminals', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        osRelease: '10.0.26100',
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: null
      })
    ).toEqual({
      windowsPty: { backend: 'conpty', buildNumber: 26100 }
    })
  })

  it('keeps ConPTY enabled when the Windows release cannot be parsed', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        osRelease: 'bad-release',
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: null
      })
    ).toEqual({
      windowsPty: { backend: 'conpty' }
    })
  })

  it('skips compatibility options for SSH-backed Windows terminals', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        osRelease: '10.0.26100',
        connectionId: 'ssh-1',
        cwd: 'C:\\repo',
        shellOverride: null
      })
    ).toEqual({})
  })

  it('skips compatibility options for WSL cwd terminals', () => {
    for (const cwd of [
      '\\\\wsl.localhost\\Ubuntu\\home\\me\\repo',
      '\\\\wsl$\\Debian\\home\\me\\repo',
      '//wsl.localhost/Ubuntu/home/me/repo',
      '//wsl$/Debian/home/me/repo'
    ]) {
      expect(
        buildWindowsPtyCompatibilityOptions({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          osRelease: '10.0.26100',
          connectionId: null,
          cwd,
          shellOverride: null
        })
      ).toEqual({})
    }
  })

  it('skips compatibility options when the shell override launches WSL', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        osRelease: '10.0.26100',
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: 'C:\\Windows\\System32\\wsl.exe'
      })
    ).toEqual({})
  })

  it('returns no options outside Windows', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        osRelease: '23.0.0',
        connectionId: null,
        cwd: '/repo',
        shellOverride: null
      })
    ).toEqual({})
  })

  it('classifies a global-WSL default shell as non-native, matching main', () => {
    // Why: main folds the global terminalWindowsShell into its spawn
    // classification (isNativeWindowsLocalPtySpawn). Without the fold the
    // renderer would call a tab with no override native-ConPTY while main
    // never marks it.
    const windowsUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    expect(
      isLocalNativeWindowsPty({
        userAgent: windowsUserAgent,
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: resolveWindowsShellOverride(undefined, 'wsl.exe')
      })
    ).toBe(false)
    // A tab-level override beats the global setting, both directions.
    expect(
      isLocalNativeWindowsPty({
        userAgent: windowsUserAgent,
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: resolveWindowsShellOverride('powershell.exe', 'wsl.exe')
      })
    ).toBe(true)
    expect(
      isLocalNativeWindowsPty({
        userAgent: windowsUserAgent,
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: resolveWindowsShellOverride('wsl.exe', 'powershell.exe')
      })
    ).toBe(false)
  })

  it('exposes the same local native Windows predicate for related renderer workarounds', () => {
    expect(
      isLocalNativeWindowsPty({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        connectionId: null,
        cwd: 'C:\\repo',
        shellOverride: 'powershell.exe'
      })
    ).toBe(true)
    expect(
      isLocalNativeWindowsPty({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        connectionId: 'ssh-1',
        cwd: 'C:\\repo',
        shellOverride: 'powershell.exe'
      })
    ).toBe(false)
  })
})
