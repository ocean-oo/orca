/**
 * @vitest-environment happy-dom
 */
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT } from '@/constants/terminal'
import { requestActiveTerminalPaneSplit } from './request-active-terminal-pane-split'
import { SortableTabContextMenu } from './SortableTabContextMenu'

const storeMock = vi.hoisted(() => ({
  dropUnifiedTab: vi.fn(),
  state: {
    keybindings: {},
    unifiedTabsByWorktree: {},
    groupsByWorktree: {}
  } as Record<string, unknown>
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  formatShortcutLabel: () => '⌘D'
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuShortcut: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children
}))

vi.mock('lucide-react', () => ({
  PanelBottomClose: () => null,
  PanelRightClose: () => null,
  Pin: () => null,
  PinOff: () => null
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('../../store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(storeMock.state),
    {
      getState: () => storeMock.state
    }
  )
}))

function renderMenu(overrides: Partial<ComponentProps<typeof SortableTabContextMenu>> = {}): {
  container: HTMLDivElement
  root: Root
  onActivate: ReturnType<typeof vi.fn>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onActivate = vi.fn()
  act(() => {
    root.render(
      <SortableTabContextMenu
        tab={{
          id: 'term-1',
          ptyId: null,
          worktreeId: 'wt-1',
          title: 'bash',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 0
        }}
        unifiedTabId="tab-1"
        groupId="group-1"
        isActive
        open
        point={{ x: 0, y: 0 }}
        tabCount={2}
        hasTabsToRight
        isPinned={false}
        onOpenChange={vi.fn()}
        onActivate={onActivate}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToRight={vi.fn()}
        onRenameOpen={vi.fn()}
        onSetTabColor={vi.fn()}
        onTogglePin={vi.fn()}
        {...overrides}
      />
    )
  })
  return { container, root, onActivate }
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label)
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`)
  }
  return button
}

function getLastSplitEvent(spy: ReturnType<typeof vi.spyOn>): CustomEvent {
  const event = spy.mock.calls.at(-1)?.[0]
  if (!(event instanceof CustomEvent)) {
    throw new Error('Expected a split request event')
  }
  return event
}

beforeEach(() => {
  storeMock.dropUnifiedTab.mockReset()
  storeMock.state = {
    keybindings: {},
    dropUnifiedTab: storeMock.dropUnifiedTab,
    groupsByWorktree: {
      'wt-1': [
        {
          id: 'group-1',
          worktreeId: 'wt-1',
          activeTabId: 'tab-1',
          tabOrder: ['tab-1', 'tab-2']
        }
      ]
    },
    unifiedTabsByWorktree: {
      'wt-1': [
        {
          id: 'tab-1',
          groupId: 'group-1',
          worktreeId: 'wt-1',
          contentType: 'terminal',
          entityId: 'term-1',
          label: 'bash',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 0
        }
      ]
    }
  }
})

describe('requestActiveTerminalPaneSplit', () => {
  it('dispatches the active terminal pane split event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    requestActiveTerminalPaneSplit({ tabId: 'term-1', direction: 'vertical' })

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe(REQUEST_ACTIVE_TERMINAL_PANE_SPLIT_EVENT)
    expect(event.detail).toEqual({
      tabId: 'term-1',
      direction: 'vertical'
    })

    dispatchSpy.mockRestore()
  })
})

describe('SortableTabContextMenu', () => {
  it('dispatches split requests and activates inactive terminal tabs first', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { container, root, onActivate } = renderMenu({ isActive: false })

    act(() => getButton(container, 'Split terminal right').click())
    expect(onActivate).toHaveBeenCalledWith('term-1')
    expect(getLastSplitEvent(dispatchSpy).detail).toEqual({
      tabId: 'term-1',
      direction: 'vertical'
    })

    dispatchSpy.mockClear()
    act(() => getButton(container, 'Split terminal down').click())
    expect(getLastSplitEvent(dispatchSpy).detail).toEqual({
      tabId: 'term-1',
      direction: 'horizontal'
    })

    act(() => root.unmount())
    container.remove()
    dispatchSpy.mockRestore()
  })

  it('renders workspace pane-column actions and routes directions to the move path', () => {
    storeMock.dropUnifiedTab.mockReturnValue(true)
    const { container, root } = renderMenu()

    expect(container.textContent).toContain('Workspace layout')
    expect(container.textContent).toContain('Move Tab to Split')

    act(() => getButton(container, 'Right').click())
    expect(storeMock.dropUnifiedTab).toHaveBeenCalledWith('tab-1', {
      groupId: 'group-1',
      splitDirection: 'right'
    })

    act(() => root.unmount())
    container.remove()
  })

  it('hides workspace pane-column actions for a single-tab group', () => {
    storeMock.state = {
      ...storeMock.state,
      groupsByWorktree: {
        'wt-1': [
          {
            id: 'group-1',
            worktreeId: 'wt-1',
            activeTabId: 'tab-1',
            tabOrder: ['tab-1']
          }
        ]
      }
    }
    const { container, root } = renderMenu()

    expect(container.textContent).not.toContain('Workspace layout')

    act(() => root.unmount())
    container.remove()
  })
})
