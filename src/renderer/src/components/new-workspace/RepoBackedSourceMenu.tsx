import { Check, ChevronDown, LoaderCircle, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import RepoBadgeLabel from '@/components/repo/RepoBadgeLabel'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'

type RepoBackedSourceMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: readonly NewWorkspaceProjectOption[]
  selectedOption: NewWorkspaceProjectOption | null
  selectedOptionId: string | null
  onSelect: (sourceId: string) => void
  emptyMessage: string | null
  requiresConnection: boolean
  connectionId: string | null
  sshStatusLabel: string | null
  connectButtonLabel: string | null
  connectInProgress: boolean
  onConnect?: () => Promise<void>
}

export default function RepoBackedSourceMenu({
  open,
  onOpenChange,
  options,
  selectedOption,
  selectedOptionId,
  onSelect,
  emptyMessage,
  requiresConnection,
  connectionId,
  sshStatusLabel,
  connectButtonLabel,
  connectInProgress,
  onConnect
}: RepoBackedSourceMenuProps): React.JSX.Element {
  const triggerRepoLabel =
    selectedOption?.displayName ??
    translate('auto.components.new.workspace.RepoBackedSourceMenu.chooseRepo', 'Choose repo')
  const showConnectionRow = requiresConnection && Boolean(connectionId) && onConnect !== undefined

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7 max-w-[11rem] shrink-0 gap-1.5 px-2 text-xs font-normal"
          aria-label={translate(
            'auto.components.new.workspace.RepoBackedSourceMenu.chooseSearchRepo',
            'Choose task search repo'
          )}
        >
          <span className="min-w-0 truncate">{triggerRepoLabel}</span>
          <ChevronDown className="size-3 opacity-55" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          {translate(
            'auto.components.new.workspace.RepoBackedSourceMenu.searchTasksIn',
            'Search tasks in'
          )}
        </div>
        {options.length > 0 ? (
          <div className="space-y-0.5">
            {options.map((option) => {
              const selected = option.id === selectedOptionId
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none',
                    selected && 'bg-accent/70 text-accent-foreground'
                  )}
                  onClick={() => onSelect(option.id)}
                >
                  <Check
                    className={cn(
                      'size-3.5 shrink-0 text-foreground',
                      selected ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <RepoBadgeLabel
                      name={option.displayName}
                      color={option.badgeColor}
                      className="max-w-full"
                      badgeClassName="size-1.5"
                    />
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {option.detail}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : emptyMessage ? (
          <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">{emptyMessage}</p>
        ) : null}
        {showConnectionRow ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-1 flex items-center justify-between gap-2 border-t border-border/50 px-2 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">
                {translate('auto.components.NewWorkspaceComposerCard.b5a0796911', 'Connect')}{' '}
                {selectedOption?.displayName ?? triggerRepoLabel}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {sshStatusLabel ??
                  translate(
                    'auto.components.NewWorkspaceComposerCard.notConnected',
                    'Not connected'
                  )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void onConnect?.()}
              disabled={connectInProgress}
              className="shrink-0"
            >
              {connectInProgress ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <PlugZap className="size-3.5" />
              )}
              {connectInProgress
                ? translate('auto.components.NewWorkspaceComposerCard.f660aa1454', 'Connecting')
                : (connectButtonLabel ??
                  translate(
                    'auto.components.NewWorkspaceComposerCard.connectSourceLookup',
                    'Connect'
                  ))}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
