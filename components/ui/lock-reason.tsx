'use client'

import * as React from 'react'
import { Lock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Three-form lock-state display.
//
//  <LockBadge reason="Freight is locked for this shipment" /> — full badge
//      with the "Locked" label. Use in detail-page headers next to a status
//      badge.
//
//  <LockTooltip reason="Doc is closed">{children}</LockTooltip> — wraps a
//      disabled button so the user can reveal *why* it's disabled. The child
//      must be a button-like element; the wrapper catches the tap/click.
//
//  <SystemPinnedIndicator reason="..." /> — bare lock glyph for use INSIDE
//      a table cell next to the row's name. Use this on any settings row
//      whose name is referenced verbatim from runtime code (accounting RPCs,
//      close-doc balancing, etc.) so the operator sees at a glance that
//      renaming or deleting the row will break the dependent flow. Pair with
//      action-layer guards (`SYSTEM_PINNED_NAMES` in lib/actions/crud.ts +
//      `PRE_CHECK_HOOKS` in lib/actions/soft-delete.ts) so the indicator
//      reflects real enforcement, not a hint.
//
// House rule: every disabled-because-of-state affordance MUST surface its
// reason. Never silently hide unless the user couldn't have known the
// affordance existed. The reason is revealed on click/tap via a Popover
// (mirroring HelpHint) — a hover-only Tooltip never opens for a finger, so the
// reason would be unreachable on touch devices (R-UX-022).

function ReasonPopover({
  reason,
  children,
  contentClassName,
}: {
  reason: string
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn('w-auto max-w-xs text-sm leading-relaxed text-muted-foreground', contentClassName)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {reason}
      </PopoverContent>
    </Popover>
  )
}

export function LockBadge({
  reason,
  className,
}: {
  reason: string
  className?: string
}) {
  return (
    <ReasonPopover reason={reason}>
      <button
        type="button"
        aria-label={`Locked: ${reason}`}
        className={cn(
          'inline-flex cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Badge variant="outline" className="pointer-events-none gap-1">
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      </button>
    </ReasonPopover>
  )
}

export function LockTooltip({
  reason,
  children,
}: {
  reason: string | null | undefined
  children: React.ReactNode
}) {
  if (!reason) return <>{children}</>
  return (
    <ReasonPopover reason={reason}>
      {/* Wrap in a focusable span so the popover still opens when the inner
          button is disabled (disabled buttons don't fire pointer events). */}
      <span
        role="button"
        tabIndex={0}
        aria-label={reason}
        className="inline-flex cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </span>
    </ReasonPopover>
  )
}

// Bare lock glyph for in-table use. Render INSIDE the Name cell next to
// the row's display name. Click/tap surfaces the reason. Pair with real
// action-layer enforcement (SYSTEM_PINNED_NAMES / SYSTEM_PINNED_TABLES
// in lib/actions/crud.ts + PRE_CHECK_HOOKS in lib/actions/soft-delete.ts) so
// the icon never lies.
export function SystemPinnedIndicator({
  reason,
  className,
}: {
  reason: string
  className?: string
}) {
  return (
    <ReasonPopover reason={reason}>
      <button
        type="button"
        aria-label={`System-pinned row (name referenced from code): ${reason}`}
        // Stop the tap/click from also firing the surrounding row's select/nav.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex shrink-0 cursor-help items-center rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Lock className="h-3.5 w-3.5" />
      </button>
    </ReasonPopover>
  )
}

// Convenience renderer for table Name cells. Renders the lock + name with
// consistent spacing across every settings table. `pin` null = unlocked row.
export function PinnedNameCell({
  name,
  pin,
}: {
  name: string
  pin: { reason: string } | null | undefined
}) {
  if (!pin) return <>{name}</>
  return (
    <span className="inline-flex items-center gap-1.5">
      <SystemPinnedIndicator reason={pin.reason} />
      <span>{name}</span>
    </span>
  )
}
