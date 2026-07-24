'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { List, type LucideIcon } from 'lucide-react'
import { CreateActionButton } from '@/components/ui/create-action-button'
import { LockTooltip } from '@/components/ui/lock-reason'
import { cn } from '@/lib/utils'
import { buildCreateDrawerUrl } from './use-url-row-selection'

type Props = {
  description: string
  buttonLabel?: string
  newParam?: string
  newValue?: string
  canCreate?: boolean
  disabledReason?: string
  icon?: LucideIcon
  className?: string
}

export function SplitEmptyState({
  description,
  buttonLabel,
  newParam = 'new',
  newValue = '1',
  canCreate = true,
  disabledReason,
  icon: Icon = List,
  className,
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const suffix = newParam === 'new' ? '' : newParam.replace(/^new_?/, '')
  const createHref = buildCreateDrawerUrl(
    pathname,
    searchParams.toString(),
    suffix
      ? {
          selectedParam: `selected_${suffix}`,
          newParam,
          editParam: `edit_${suffix}`,
        }
      : undefined,
  )
  const resolvedCreateHref = newValue === '1'
    ? createHref
    : (() => {
        const url = new URL(createHref, 'https://protec.local')
        url.searchParams.set(newParam, newValue)
        return `${url.pathname}?${url.searchParams.toString()}`
      })()

  const shouldShowAction = !!buttonLabel && (canCreate || !!disabledReason)

  return (
    // Desktop-only (max-lg:hidden): in the stacked mobile/tablet layout this
    // hero would sit as a large dead block above/around the list — the table
    // toolbar's create button and its emptyMessage cover small screens. Some
    // pages pass this as SplitView's `detail`, others via `emptyState`, so the
    // guard lives here to cover both wirings.
    <div className={cn('max-lg:hidden rounded-md border bg-muted/30 px-4 py-12 text-center space-y-3', className)}>
      <Icon className="mx-auto size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{description}</p>
      {shouldShowAction && (
        canCreate ? (
          <CreateActionButton href={resolvedCreateHref} label={buttonLabel} />
        ) : (
          <LockTooltip reason={canCreate ? null : disabledReason}>
            <CreateActionButton
              href={canCreate ? resolvedCreateHref : undefined}
              label={buttonLabel}
              disabled={!canCreate}
            />
          </LockTooltip>
        )
      )}
    </div>
  )
}
