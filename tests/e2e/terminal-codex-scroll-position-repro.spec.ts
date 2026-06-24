import type { Page } from '@stablyai/playwright-test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import {
  ensureTerminalVisible,
  getActiveWorktreeId,
  getAllWorktreeIds,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import {
  getTerminalContent,
  sendToTerminal,
  splitActiveTerminalPane,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

const CODEX_READY_RE = /Ask Codex|OpenAI|Type your question|press enter/i
const CODEX_TRUST_PROMPT_RE = /Do you trust|trust this folder|Trust this/i
const CODEX_UPDATE_PROMPT_RE = /update available|install update|Skip for now/i
const ARTIFACT_DIR = path.join(process.cwd(), '.tmp', 'codex-scroll-repro')

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function dismissCodexPromptsIfPresent(page: Page): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const content = await getTerminalContent(page, 20_000)
    if (CODEX_READY_RE.test(content) && !CODEX_TRUST_PROMPT_RE.test(content)) {
      return
    }
    if (CODEX_TRUST_PROMPT_RE.test(content)) {
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      continue
    }
    if (CODEX_UPDATE_PROMPT_RE.test(content)) {
      await page.keyboard.type('3')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      continue
    }
    await page.waitForTimeout(250)
  }
}

async function focusPaneByIndex(page: Page, paneIndex: number): Promise<void> {
  await page.evaluate((paneIndex) => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getPanes?.()[paneIndex] ?? null
    if (!manager || !pane) {
      throw new Error(`Terminal pane ${paneIndex} is unavailable`)
    }
    manager.setActivePane(pane.id, { focus: true })
  }, paneIndex)
}

async function readActiveTerminalScrollState(page: Page): Promise<{
  baseY: number
  bufferType: string
  leafId: string | null
  paneId: number
  viewportY: number
}> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!pane) {
      throw new Error('Active terminal pane unavailable')
    }
    const buffer = pane.terminal.buffer.active
    return {
      baseY: buffer.baseY,
      bufferType: buffer.type,
      leafId: pane.leafId ?? null,
      paneId: pane.id,
      viewportY: buffer.viewportY
    }
  })
}

async function readTerminalScrollStateForPaneIndex(
  page: Page,
  paneIndex: number
): Promise<{
  baseY: number
  bufferType: string
  leafId: string | null
  paneId: number
  viewportY: number
}> {
  return page.evaluate((paneIndex) => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getPanes?.()[paneIndex] ?? null
    if (!pane) {
      throw new Error(`Terminal pane ${paneIndex} unavailable`)
    }
    const buffer = pane.terminal.buffer.active
    return {
      baseY: buffer.baseY,
      bufferType: buffer.type,
      leafId: pane.leafId ?? null,
      paneId: pane.id,
      viewportY: buffer.viewportY
    }
  }, paneIndex)
}

async function scrollCodexViewportJustAboveBottom(page: Page): Promise<{
  baseY: number
  bufferType: string
  leafId: string | null
  paneId: number
  viewportY: number
}> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!pane) {
      throw new Error('Active terminal pane unavailable')
    }
    const buffer = pane.terminal.buffer.active
    pane.terminal.scrollToBottom()
    const targetViewportY = Math.max(1, buffer.baseY - 8)
    pane.terminal.scrollToLine(targetViewportY)
    const viewport = pane.container.querySelector<HTMLElement>('.xterm-viewport')
    viewport?.dispatchEvent(new Event('scroll', { bubbles: true }))
    pane.terminal.focus()
    return {
      baseY: buffer.baseY,
      bufferType: buffer.type,
      leafId: pane.leafId ?? null,
      paneId: pane.id,
      viewportY: buffer.viewportY
    }
  })
}

async function waitForCodexReady(page: Page): Promise<void> {
  try {
    await expect
      .poll(
        () => getTerminalContent(page, 20_000).then((content) => CODEX_READY_RE.test(content)),
        {
          timeout: 60_000,
          message: 'Codex TUI did not render'
        }
      )
      .toBe(true)
  } catch (error) {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    writeFileSync(
      path.join(ARTIFACT_DIR, 'codex-launch-terminal.txt'),
      await getTerminalContent(page, 20_000)
    )
    throw error
  }
}

async function waitForTerminalScrollback(page: Page): Promise<void> {
  try {
    await expect
      .poll(() => readActiveTerminalScrollState(page).then((state) => state.baseY), {
        timeout: 180_000,
        message: 'Codex did not produce terminal scrollback'
      })
      .toBeGreaterThan(40)
  } catch (error) {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    writeFileSync(
      path.join(ARTIFACT_DIR, 'codex-no-scrollback-terminal.txt'),
      await getTerminalContent(page, 40_000)
    )
    throw error
  }
}

test.describe('Codex TUI scroll position repro', () => {
  test('keeps real Codex TUI scrollback position across worktree switches', async ({
    orcaPage
  }, testInfo) => {
    test.setTimeout(240_000)
    test.skip(process.env.ORCA_E2E_REAL_CODEX !== '1', 'requires real local Codex CLI')
    test.skip(process.platform === 'win32', 'local Codex command is POSIX-shell oriented')

    await waitForSessionReady(orcaPage)
    const firstWorktreeId = await waitForActiveWorktree(orcaPage)
    const secondWorktreeId = (await getAllWorktreeIds(orcaPage)).find(
      (id) => id !== firstWorktreeId
    )
    test.skip(!secondWorktreeId, 'Codex scroll repro needs a second seeded worktree')
    if (!secondWorktreeId) {
      return
    }

    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    const ptyId = await waitForActivePanePtyId(orcaPage)

    const marker = `CODEX_SCROLL_REPRO_${Date.now()}`
    const prompt = [
      'Do not run commands.',
      'Reply with exactly 140 separate short lines.',
      `Each line must be in the form "${marker}_VISIBLE_LINE_N" where N counts up from 0.`,
      'Do not use markdown bullets or code fences.'
    ].join(' ')
    const codexCommand = [
      'codex',
      '--no-alt-screen',
      '--dangerously-bypass-approvals-and-sandbox',
      '--dangerously-bypass-hook-trust',
      '-C',
      shellQuote(process.cwd()),
      shellQuote(prompt)
    ].join(' ')
    await sendToTerminal(orcaPage, ptyId, `${codexCommand}\r`)
    await dismissCodexPromptsIfPresent(orcaPage)
    await waitForCodexReady(orcaPage)
    await waitForTerminalScrollback(orcaPage)
    await splitActiveTerminalPane(orcaPage, 'vertical')
    await expect
      .poll(
        () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const tabId = state?.activeTabId
            return tabId ? (window.__paneManagers?.get(tabId)?.getPanes?.().length ?? 0) : 0
          }),
        { timeout: 10_000 }
      )
      .toBe(2)
    await focusPaneByIndex(orcaPage, 0)

    const beforeSwitch = await scrollCodexViewportJustAboveBottom(orcaPage)
    testInfo.annotations.push({
      type: 'codex-scroll-before-switch',
      description: JSON.stringify(beforeSwitch)
    })
    expect(beforeSwitch.baseY).toBeGreaterThan(20)
    expect(beforeSwitch.viewportY).toBeGreaterThan(0)
    expect(beforeSwitch.viewportY).toBeLessThan(beforeSwitch.baseY)

    await orcaPage.getByRole('option', { name: /e2e-secondary/ }).click()
    await expect
      .poll(() => getActiveWorktreeId(orcaPage), { timeout: 10_000 })
      .toBe(secondWorktreeId)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    await orcaPage.waitForTimeout(500)

    await orcaPage.getByRole('option', { name: /main/ }).first().click()
    await expect
      .poll(() => getActiveWorktreeId(orcaPage), { timeout: 10_000 })
      .toBe(firstWorktreeId)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)

    const afterSwitch = await readTerminalScrollStateForPaneIndex(orcaPage, 0)
    testInfo.annotations.push({
      type: 'codex-scroll-after-switch',
      description: JSON.stringify(afterSwitch)
    })
    const beforeBottomOffset = beforeSwitch.baseY - beforeSwitch.viewportY
    const afterBottomOffset = afterSwitch.baseY - afterSwitch.viewportY
    expect(afterSwitch.viewportY).toBeGreaterThan(0)
    // xterm can reflow several rows when the split pane is hidden and refit;
    // the regression is the viewport teleporting to the top.
    expect(Math.abs(afterBottomOffset - beforeBottomOffset)).toBeLessThanOrEqual(10)
  })
})
