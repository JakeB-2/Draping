'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { MoreVertical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
// RowSelectCell — inline <Select> for editing a single cell value in-place.
// Calls onValueChange immediately when user selects a new option.
// Stops click propagation so it doesn't trigger onRowClick.
// ---------------------------------------------------------------------------

type RowSelectCellProps = {
  value: string
  options: { label: string; value: string }[]
  onValueChange: (newValue: string) => Promise<void> | void
  className?: string
}

export function RowSelectCell({ value, options, onValueChange, className }: RowSelectCellProps) {
  const [pending, startTransition] = useTransition()

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={value}
        onValueChange={(v) => startTransition(() => onValueChange(v))}
        disabled={pending}
      >
        <SelectTrigger className={className ?? 'h-7 w-36 text-xs'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RowActionsMenu — vertical-ellipsis overflow menu for row-level options.
// Accepts a typed action list: links, callbacks, or separators.
// Stops click propagation on the trigger so it doesn't fire onRowClick.
// ---------------------------------------------------------------------------

type RowAction =
  | { type: 'link'; label: string; href: string; icon?: LucideIcon }
  | { type: 'action'; label: string; onClick: () => void; icon?: LucideIcon; destructive?: boolean }
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
          size="icon"
          className="size-7 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {actions.map((action, i) => {
          if (action.type === 'separator') {
            return <DropdownMenuSeparator key={i} />
          }
          if (action.type === 'link') {
            const Icon = action.icon
            return (
              <DropdownMenuItem key={action.label} asChild>
                <Link href={action.href} onClick={(e) => e.stopPropagation()}>
                  {Icon && <Icon className="size-4" />}
                  {action.label}
                </Link>
              </DropdownMenuItem>
            )
          }
          const Icon = action.icon
          return (
            <DropdownMenuItem
              key={action.label}
              onClick={(e) => { e.stopPropagation(); action.onClick() }}
              className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}
            >
              {Icon && <Icon className="size-4" />}
              {action.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
