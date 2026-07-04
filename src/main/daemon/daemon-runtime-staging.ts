/* Why this module exists: the Windows NSIS updater (electron-builder
oneClick) stops every current-user process whose executable path is inside
the install directory (PowerShell CIM sweep), falls back to
`taskkill /IM Orca.exe`, and then overwrites the install dir — including
app.asar.unpacked/out/main/daemon-entry.js and node_modules/node-pty that the
detached terminal daemon is running from. Staging the daemon runtime under
userData removes every file the daemon needs (and every lock it holds) from
the install dir, and on Windows a renamed executable copy gives the daemon a
process identity the installer's kill sweep does not match. */
import { builtinModules } from 'node:module'
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** Image name for the staged Windows executable. Distinct from Orca.exe so
 *  the NSIS `taskkill /IM Orca.exe` fallback cannot match the daemon. */
export const STAGED_DAEMON_EXECUTABLE_FILENAME = 'orca-daemon.exe'

const STAGING_MANIFEST_FILENAME = 'runtime-manifest.json'

export type DaemonRuntimeStagingInput = {
  /** The daemon entry file inside the install dir (or dev out/ dir). */
  installEntryPath: string
  /** Version-stable parent for staged runtimes, e.g. <userData>/daemon/runtime. */
  stagingRoot: string
  appVersion: string
  platform?: NodeJS.Platform
  /** The executable that fork() would run (process.execPath). */
  execPath?: string
  log?: (message: string) => void
}

export type StagedDaemonRuntime = {
  /** Entry to fork. Falls back to installEntryPath when staging failed. */
  entryPath: string
  /** Staged executable to fork with, or null to use process.execPath. */
  execPath: string | null
  staged: boolean
}

type StagingManifest = {
  appVersion: string
  sourceEntryPath: string
  entryFile: string
  execFile: string | null
}

const NODE_BUILTINS = new Set(builtinModules)

function requireSpecifiers(source: string): string[] {
  // Why: the daemon bundle is CommonJS emitted by Rollup, so its complete
  // import surface is statically visible as require("...") calls. Walking it
  // at runtime keeps the copy correct across content-hashed chunk renames.
  return [...source.matchAll(/require\("([^"\\]+)"\)/g)].map((match) => match[1])
}

function packageNameFromSpecifier(specifier: string): string {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

function findPackageDir(startDir: string, packageName: string): string | null {
  let dir = startDir
  for (let depth = 0; depth < 10; depth++) {
    const candidate = join(dir, 'node_modules', ...packageName.split('/'))
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return null
}

async function collectRelativeClosure(entryPath: string): Promise<{
  relativeFiles: string[]
  externalPackages: string[]
}> {
  const entryDir = dirname(entryPath)
  const visited = new Set<string>()
  const externals = new Set<string>()
  const queue = [entryPath]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (visited.has(file)) {
      continue
    }
    visited.add(file)
    const source = await readFile(file, 'utf8')
    for (const specifier of requireSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier))
        continue
      }
      const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier
      if (!NODE_BUILTINS.has(bare)) {
        externals.add(packageNameFromSpecifier(specifier))
      }
    }
  }
  return {
    relativeFiles: [...visited].map((file) => relativeWithin(entryDir, file)),
    externalPackages: [...externals].sort()
  }
}

function relativeWithin(rootDir: string, file: string): string {
  const normalizedRoot = resolve(rootDir)
  const normalizedFile = resolve(file)
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error(`Daemon bundle requires a file outside its directory: ${file}`)
  }
  return normalizedFile.slice(normalizedRoot.length + 1)
}

async function copyExternalPackages(
  packageNames: string[],
  sourceStartDir: string,
  targetNodeModulesDir: string
): Promise<void> {
  const copied = new Set<string>()
  const queue = [...packageNames]
  while (queue.length > 0) {
    const packageName = queue.pop() as string
    if (copied.has(packageName)) {
      continue
    }
    copied.add(packageName)
    const sourceDir = findPackageDir(sourceStartDir, packageName)
    if (!sourceDir) {
      throw new Error(`Cannot locate daemon runtime dependency package: ${packageName}`)
    }
    const targetDir = join(targetNodeModulesDir, ...packageName.split('/'))
    await mkdir(dirname(targetDir), { recursive: true })
    // Why: dereference resolves pnpm symlinks so the staged copy stays valid
    // after the source store is pruned or the install dir is replaced.
    await cp(sourceDir, targetDir, { recursive: true, dereference: true })
    try {
      const packageJson = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
        queue.push(dependency)
      }
    } catch {
      // No package.json — nothing further to trace.
    }
  }
}

/** Sibling files the Electron binary hard-requires to boot in
 *  ELECTRON_RUN_AS_NODE mode: ffmpeg.dll is its only statically imported
 *  non-system DLL, icudtl.dat feeds ICU init, and the two .bin files are the
 *  V8 startup snapshots. GPU DLLs (libEGL/libGLESv2/dx*/vk_*) and .pak UI
 *  resources are loaded only by renderer/GPU processes, never in node mode.
 *  Measured against Electron 42.3.3 win32-x64: this set is ~246.5MB (exe
 *  231.5MB) vs ~306MB for all top-level install files. */
const WINDOWS_EXEC_RUNTIME_FILES = [
  'ffmpeg.dll',
  'icudtl.dat',
  'snapshot_blob.bin',
  'v8_context_snapshot.bin'
]

async function stageWindowsExecutable(execPath: string, targetDir: string): Promise<string> {
  const sourceDir = dirname(execPath)
  const stagedExecPath = join(targetDir, STAGED_DAEMON_EXECUTABLE_FILENAME)
  await cp(execPath, stagedExecPath, { dereference: true })
  for (const fileName of WINDOWS_EXEC_RUNTIME_FILES) {
    const source = join(sourceDir, fileName)
    if (!existsSync(source)) {
      // Why tolerated: a future Electron may drop one of these files; the
      // fork ladder falls back to the default executable if the staged copy
      // cannot boot, so a lean copy degrades gracefully instead of failing
      // the whole staging.
      continue
    }
    await cp(source, join(targetDir, fileName), { dereference: true })
  }
  return stagedExecPath
}

async function readStagingManifest(versionDir: string): Promise<StagingManifest | null> {
  try {
    const parsed = JSON.parse(
      await readFile(join(versionDir, STAGING_MANIFEST_FILENAME), 'utf8')
    ) as Partial<StagingManifest>
    if (typeof parsed.appVersion !== 'string' || typeof parsed.entryFile !== 'string') {
      return null
    }
    return {
      appVersion: parsed.appVersion,
      sourceEntryPath: typeof parsed.sourceEntryPath === 'string' ? parsed.sourceEntryPath : '',
      entryFile: parsed.entryFile,
      execFile: typeof parsed.execFile === 'string' ? parsed.execFile : null
    }
  } catch {
    return null
  }
}

function stagedRuntimeFromManifest(
  versionDir: string,
  manifest: StagingManifest
): StagedDaemonRuntime | null {
  const entryPath = join(versionDir, manifest.entryFile)
  if (!existsSync(entryPath)) {
    return null
  }
  const execPath = manifest.execFile ? join(versionDir, manifest.execFile) : null
  if (execPath && !existsSync(execPath)) {
    return null
  }
  return { entryPath, execPath, staged: true }
}

export function getDaemonRuntimeVersionDir(stagingRoot: string, appVersion: string): string {
  return join(stagingRoot, `v${appVersion}`)
}

export async function stageDaemonRuntime(
  input: DaemonRuntimeStagingInput
): Promise<StagedDaemonRuntime> {
  const platform = input.platform ?? process.platform
  const log = input.log ?? ((message: string) => console.warn(message))
  const versionDir = getDaemonRuntimeVersionDir(input.stagingRoot, input.appVersion)
  const fallback: StagedDaemonRuntime = {
    entryPath: input.installEntryPath,
    execPath: null,
    staged: false
  }

  try {
    // Fast path: a completed staging for this app version is reused as-is so
    // relaunches cost one manifest read instead of a copy.
    const existingManifest = await readStagingManifest(versionDir)
    if (existingManifest && existingManifest.appVersion === input.appVersion) {
      const reused = stagedRuntimeFromManifest(versionDir, existingManifest)
      if (reused) {
        return reused
      }
    }

    const buildDir = `${versionDir}.staging-${process.pid}`
    await rm(buildDir, { recursive: true, force: true })
    await mkdir(buildDir, { recursive: true })

    const closure = await collectRelativeClosure(input.installEntryPath)
    const entryDir = dirname(input.installEntryPath)
    for (const relativeFile of closure.relativeFiles) {
      const target = join(buildDir, relativeFile)
      await mkdir(dirname(target), { recursive: true })
      await cp(join(entryDir, relativeFile), target, { dereference: true })
    }
    if (closure.externalPackages.length > 0) {
      await copyExternalPackages(
        closure.externalPackages,
        entryDir,
        join(buildDir, 'node_modules')
      )
    }

    let execFile: string | null = null
    if (platform === 'win32' && input.execPath) {
      await stageWindowsExecutable(input.execPath, buildDir)
      execFile = STAGED_DAEMON_EXECUTABLE_FILENAME
    }

    const manifest: StagingManifest = {
      appVersion: input.appVersion,
      sourceEntryPath: input.installEntryPath,
      entryFile: basename(input.installEntryPath),
      execFile
    }
    await writeFile(join(buildDir, STAGING_MANIFEST_FILENAME), JSON.stringify(manifest), 'utf8')

    // Why: build-then-rename keeps half-copied runtimes invisible; a crash
    // mid-copy leaves only a .staging-* dir that the next attempt removes.
    await rm(versionDir, { recursive: true, force: true })
    await rename(buildDir, versionDir)

    const staged = stagedRuntimeFromManifest(versionDir, manifest)
    if (!staged) {
      return fallback
    }
    return staged
  } catch (error) {
    log(
      `[daemon] Failed to stage install-independent daemon runtime — falling back to the install dir entry: ${error instanceof Error ? error.message : String(error)}`
    )
    return fallback
  }
}

export type PruneDaemonRuntimeStagingInput = {
  stagingRoot: string
  /** The version dir for the currently staged runtime; never pruned. */
  keepVersionDir: string
  /** Entry paths recorded in daemon pid files. Any staged dir that still
   *  backs a (possibly live) daemon is preserved so adoption keeps working. */
  referencedEntryPaths: readonly string[]
}

export async function pruneDaemonRuntimeStaging(
  input: PruneDaemonRuntimeStagingInput
): Promise<void> {
  let entries
  try {
    entries = await readdir(input.stagingRoot, { withFileTypes: true })
  } catch {
    return
  }
  const keep = resolve(input.keepVersionDir)
  const referenced = input.referencedEntryPaths.map((entryPath) => resolve(entryPath))
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const dir = resolve(join(input.stagingRoot, entry.name))
    if (dir === keep) {
      continue
    }
    if (referenced.some((entryPath) => entryPath.startsWith(dir + '/') || entryPath.startsWith(dir + '\\'))) {
      continue
    }
    // Why best-effort: on Windows a still-running older daemon holds locks on
    // its pty.node — the partial failure is harmless and retried next launch.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
