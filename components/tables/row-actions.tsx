'use client'

import { useTransition, useOptimistic } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, MoreVertical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LockTooltip } from '@/components/ui/lock-reason'

// ---------------------------------------------------------------------------
// RowActionButton — a single-purpose action button for a table row cell.
// Stops click propagation so it doesn't trigger onRowClick.
// ---------------------------------------------------------------------------

type RowActionButtonProps = {
  label: string
  icon?: LucideIcon
  onClick: () => Promise<void> | void
  variant?: 'outline' | 'default' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'default'
  className?: string
}

export function RowActionButton({
  label,
  icon: Icon,
  onClick,
  variant = 'outline',
  size = 'sm',
  className,
}: RowActionButtonProps) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation()
        startTransition(() => onClick())
      }}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// ApproveButton — outline button with green check icon, optimistic-hide on
// click. Parent passes `visible` from the real status; on click we flip the
// optimistic copy false so the button disappears before the server roundtrip
// completes. Shared between work entries, inventory reports, and any future
// approve surfaces.
// ---------------------------------------------------------------------------

type ApproveButtonProps = {
  visible: boolean
  onApprove: () => Promise<string | null>
  label?: string
  pendingLabel?: string
  successMessage?: string
  failureMessage?: string
}

export function ApproveButton({
  visible,
  onApprove,
  label = 'Approve',
  pendingLabel = 'Approving',
  successMessage = 'Approved',
  failureMessage = 'Could not approve',
}: ApproveButtonProps) {
  const [pending, startTransition] = useTransition()
  const [optimisticVisible, setOptimisticVisible] = useOptimistic(visible)

  if (!optimisticVisible) return null

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation()
        startTransition(async () => {
          setOptimisticVisible(false)
          const err = await onApprove()
          if (err) {
            toast.error(`${failureMessage}: ${err}`)
            return
          }
          toast.success(successMessage)
        })
      }}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          {pendingLabel}
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          {label}
        </>
      )}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// RowActionsMenu — vertical-ellipsis overflow menu for row-level options.
// Accepts a typed action list: links, callbacks, or separators.
// Stops click propagation on the trigger so it doesn't fire onRowClick.
// ---------------------------------------------------------------------------

export type RowAction =
  | {
      type: 'link'
      label: string
      href: string
      icon?: LucideIcon
      disabled?: boolean
      /** Tooltip-rendered reason explaining the disabled state. */
      disabledReason?: string
    }
  | {
      type: 'action'
      label: string
      onClick: () => void
      icon?: LucideIcon
      destructive?: boolean
      disabled?: boolean
      /** Tooltip-rendered reason explaining the disabled state. */
      disabledReason?: string
    }
  | { type: 'separator' }

type RowActionsMenuProps = {
  actions: RowAction[]
  align?: 'end' | 'start'
}

export function RowActionsMenu({ actions, align = 'end' }: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        {actions.map((action, i) => {
          if (action.type === 'separator') {
            return <DropdownMenuSeparator key={i} />
          }
          const Icon = action.icon
          const isDisabled = !!action.disabled || !!action.disabledReason
          const inner = (
            <>
              {Icon && <Icon className="size-4" />}
              {action.label}
            </>
          )
          const item = action.type === 'link' ? (
            <DropdownMenuItem key={action.label} asChild disabled={isDisabled}>
              <Link href={action.href} onClick={(e) => e.stopPropagation()}>
                {inner}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={action.label}
              onClick={(e) => { e.stopPropagation(); action.onClick() }}
              disabled={isDisabled}
              className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}
            >
              {inner}
            </DropdownMenuItem>
          )
          if (action.disabledReason) {
            return (
              <LockTooltip key={action.label} reason={action.disabledReason}>
                {item}
              </LockTooltip>
            )
          }
          return item
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
