import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  STAGED_DAEMON_EXECUTABLE_FILENAME,
  getDaemonRuntimeVersionDir,
  pruneDaemonRuntimeStaging,
  stageDaemonRuntime
} from './daemon-runtime-staging'

describe('daemon runtime staging', () => {
  let dir: string
  let installDir: string
  let stagingRoot: string
  let installEntryPath: string

  function writeInstallBundle(): void {
    // Mirrors the real packaged layout: entry + hashed chunk + externalized
    // native package under a sibling node_modules.
    mkdirSync(join(installDir, 'out', 'main', 'chunks'), { recursive: true })
    installEntryPath = join(installDir, 'out', 'main', 'daemon-entry.js')
    writeFileSync(
      installEntryPath,
      'require("node:net");\nconst s = require("./chunks/session-Abc123.js");\n',
      'utf8'
    )
    writeFileSync(
      join(installDir, 'out', 'main', 'chunks', 'session-Abc123.js'),
      'require("node:fs");\nrequire("fake-pty");\n',
      'utf8'
    )
    const fakePtyDir = join(installDir, 'node_modules', 'fake-pty')
    mkdirSync(fakePtyDir, { recursive: true })
    writeFileSync(
      join(fakePtyDir, 'package.json'),
      JSON.stringify({ name: 'fake-pty', dependencies: { 'fake-addon': '1.0.0' } }),
      'utf8'
    )
    writeFileSync(join(fakePtyDir, 'index.js'), 'module.exports = 1\n', 'utf8')
    const fakeAddonDir = join(installDir, 'node_modules', 'fake-addon')
    mkdirSync(fakeAddonDir, { recursive: true })
    writeFileSync(join(fakeAddonDir, 'package.json'), JSON.stringify({ name: 'fake-addon' }))
    writeFileSync(join(fakeAddonDir, 'index.js'), 'module.exports = 2\n', 'utf8')
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-runtime-staging-test-'))
    installDir = join(dir, 'install')
    stagingRoot = join(dir, 'staging')
    writeInstallBundle()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('stages the entry, its chunk closure, and external packages transitively', async () => {
    const staged = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'darwin',
      log: () => {}
    })

    expect(staged.staged).toBe(true)
    expect(staged.execPath).toBeNull()
    const versionDir = getDaemonRuntimeVersionDir(stagingRoot, '1.0.0')
    expect(staged.entryPath).toBe(join(versionDir, 'daemon-entry.js'))
    expect(existsSync(join(versionDir, 'chunks', 'session-Abc123.js'))).toBe(true)
    expect(existsSync(join(versionDir, 'node_modules', 'fake-pty', 'index.js'))).toBe(true)
    // Transitive dependency of the external package is staged too.
    expect(existsSync(join(versionDir, 'node_modules', 'fake-addon', 'index.js'))).toBe(true)
  })

  it('reuses a completed staging for the same app version without re-copying', async () => {
    const first = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'darwin',
      log: () => {}
    })
    // Mutate the source after staging; a re-run must not propagate it.
    writeFileSync(installEntryPath, '// mutated\n', 'utf8')

    const second = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'darwin',
      log: () => {}
    })

    expect(second.entryPath).toBe(first.entryPath)
    expect(readFileSync(second.entryPath, 'utf8')).toContain('session-Abc123')
  })

  it('stages a fresh runtime when the app version changes', async () => {
    const first = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'darwin',
      log: () => {}
    })
    const second = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.1',
      platform: 'darwin',
      log: () => {}
    })

    expect(second.entryPath).not.toBe(first.entryPath)
    expect(existsSync(first.entryPath)).toBe(true)
    expect(existsSync(second.entryPath)).toBe(true)
  })

  it('falls back to the install entry when staging fails', async () => {
    rmSync(join(installDir, 'out', 'main', 'chunks'), { recursive: true, force: true })
    const logs: string[] = []

    const staged = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'darwin',
      log: (message) => logs.push(message)
    })

    expect(staged.staged).toBe(false)
    expect(staged.execPath).toBeNull()
    expect(staged.entryPath).toBe(installEntryPath)
    expect(logs.some((message) => message.includes('falling back'))).toBe(true)
  })

  it('stages a renamed executable copy with its boot support files on win32', async () => {
    const execDir = join(dir, 'winInstall')
    mkdirSync(execDir, { recursive: true })
    const execPath = join(execDir, 'Orca.exe')
    for (const name of [
      'Orca.exe',
      'ffmpeg.dll',
      'icudtl.dat',
      'snapshot_blob.bin',
      'v8_context_snapshot.bin',
      'libEGL.dll',
      'Uninstall Orca.exe'
    ]) {
      writeFileSync(join(execDir, name), name, 'utf8')
    }

    const staged = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'win32',
      execPath,
      log: () => {}
    })

    expect(staged.staged).toBe(true)
    const versionDir = getDaemonRuntimeVersionDir(stagingRoot, '1.0.0')
    expect(staged.execPath).toBe(join(versionDir, STAGED_DAEMON_EXECUTABLE_FILENAME))
    expect(readFileSync(staged.execPath as string, 'utf8')).toBe('Orca.exe')
    expect(existsSync(join(versionDir, 'ffmpeg.dll'))).toBe(true)
    expect(existsSync(join(versionDir, 'icudtl.dat'))).toBe(true)
    expect(existsSync(join(versionDir, 'snapshot_blob.bin'))).toBe(true)
    expect(existsSync(join(versionDir, 'v8_context_snapshot.bin'))).toBe(true)
    // GPU-only DLLs and the uninstaller are not part of the node-mode boot set.
    expect(existsSync(join(versionDir, 'libEGL.dll'))).toBe(false)
    expect(existsSync(join(versionDir, 'Uninstall Orca.exe'))).toBe(false)
    expect(existsSync(join(versionDir, 'Orca.exe'))).toBe(false)
  })

  it('tolerates missing optional executable support files', async () => {
    const execDir = join(dir, 'winInstall')
    mkdirSync(execDir, { recursive: true })
    const execPath = join(execDir, 'Orca.exe')
    writeFileSync(execPath, 'Orca.exe', 'utf8')

    const staged = await stageDaemonRuntime({
      installEntryPath,
      stagingRoot,
      appVersion: '1.0.0',
      platform: 'win32',
      execPath,
      log: () => {}
    })

    expect(staged.staged).toBe(true)
    expect(staged.execPath).toBe(
      join(getDaemonRuntimeVersionDir(stagingRoot, '1.0.0'), STAGED_DAEMON_EXECUTABLE_FILENAME)
    )
  })

  it('prunes stale version dirs but keeps the current and pid-referenced ones', async () => {
    for (const version of ['0.9.0', '1.0.0', '1.0.1']) {
      await stageDaemonRuntime({
        installEntryPath,
        stagingRoot,
        appVersion: version,
        platform: 'darwin',
        log: () => {}
      })
    }
    const keepDir = getDaemonRuntimeVersionDir(stagingRoot, '1.0.1')
    const referencedDir = getDaemonRuntimeVersionDir(stagingRoot, '1.0.0')
    const staleDir = getDaemonRuntimeVersionDir(stagingRoot, '0.9.0')

    await pruneDaemonRuntimeStaging({
      stagingRoot,
      keepVersionDir: keepDir,
      // A pid file for a still-running (legacy) daemon points into 1.0.0.
      referencedEntryPaths: [join(referencedDir, 'daemon-entry.js')]
    })

    expect(existsSync(keepDir)).toBe(true)
    expect(existsSync(referencedDir)).toBe(true)
    expect(existsSync(staleDir)).toBe(false)
  })
})
