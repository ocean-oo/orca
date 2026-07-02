import React from 'react'
import { LoaderCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type WorktreeTitleFieldRenameProps = {
  titleElementKey: string
  displayName: string
  value: string
  disabled: boolean
  editing: boolean
  saving: boolean
  showUnreadEmphasis: boolean
  className?: string
  editingClassName?: string
  inputClassName?: string
  suppressMouseSelection: boolean
  rootRef: React.RefCallback<HTMLSpanElement>
  inputRef: React.RefCallback<HTMLInputElement>
  onStartRename: (event: React.MouseEvent<HTMLElement>) => void
  onStopCardEvent: (event: React.SyntheticEvent) => void
  onInputDoubleClick: (event: React.MouseEvent<HTMLInputElement>) => void
  onInputDragStart: (event: React.DragEvent<HTMLInputElement>) => void
  onInputMouseDown: (event: React.MouseEvent<HTMLInputElement>) => void
  onInputSelect: (event: React.SyntheticEvent<HTMLInputElement>) => void
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onValueChange: (value: string) => void
  onCommitRename: () => void
}

const fieldEditingInputClassName =
  'h-6 rounded-sm border border-input bg-input/40 px-0 py-0 shadow-xs selection:bg-[Highlight] selection:text-[HighlightText] focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50 dark:bg-input/30'
const fieldReadInputClassName =
  'h-[1lh] rounded-none border-0 !border-transparent !bg-transparent p-0 !shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none dark:!bg-transparent'

export function WorktreeTitleFieldRename({
  titleElementKey,
  displayName,
  value,
  disabled,
  editing,
  saving,
  showUnreadEmphasis,
  className,
  editingClassName,
  inputClassName,
  suppressMouseSelection,
  rootRef,
  inputRef,
  onStartRename,
  onStopCardEvent,
  onInputDoubleClick,
  onInputDragStart,
  onInputMouseDown,
  onInputSelect,
  onInputKeyDown,
  onValueChange,
  onCommitRename
}: WorktreeTitleFieldRenameProps): React.JSX.Element {
  const fieldInputCursorClassName = disabled ? 'cursor-default' : 'cursor-text'

  return (
    <span
      key={`field:${titleElementKey}`}
      ref={rootRef}
      className={cn(
        'relative grid min-w-0 truncate leading-tight text-foreground',
        showUnreadEmphasis ? 'font-semibold' : 'font-normal',
        className,
        editing && editingClassName
      )}
      data-worktree-title-inline-rename={editing ? 'editing' : ''}
      onDoubleClick={editing ? undefined : onStartRename}
    >
      <span
        className="pointer-events-none invisible col-start-1 row-start-1 min-w-0 truncate whitespace-pre"
        aria-hidden="true"
      >
        {displayName}
      </span>
      <Input
        ref={inputRef}
        value={editing ? value : displayName}
        style={{ font: 'inherit' }}
        readOnly={!editing}
        disabled={saving}
        draggable={false}
        spellCheck={false}
        tabIndex={disabled ? -1 : 0}
        aria-label={translate(
          'auto.components.sidebar.WorktreeTitleInlineRename.bff3bdd00c',
          'Rename workspace'
        )}
        data-worktree-title-rename-input={editing ? 'true' : undefined}
        onChange={(event) => {
          if (editing) {
            onValueChange(event.target.value)
          }
        }}
        onBlur={editing ? onCommitRename : undefined}
        onClick={onStopCardEvent}
        onDoubleClick={editing ? onInputDoubleClick : onStartRename}
        onDragStart={onInputDragStart}
        onMouseDown={onInputMouseDown}
        onPointerDown={onStopCardEvent}
        onSelect={editing ? onInputSelect : undefined}
        onKeyDown={editing ? onInputKeyDown : onStopCardEvent}
        className={cn(
          // Why: the hovercard title keeps the same native text field before
          // and during rename so the OS cursor never has to refresh a new node.
          'col-start-1 row-start-1 min-w-0 truncate text-foreground outline-none',
          fieldInputCursorClassName,
          suppressMouseSelection ? 'select-none' : 'select-text',
          editing ? fieldEditingInputClassName : fieldReadInputClassName,
          saving && 'pr-6',
          inputClassName
        )}
      />
      {saving ? (
        <LoaderCircle className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
    </span>
  )
}
