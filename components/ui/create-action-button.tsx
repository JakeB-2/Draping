'use client'

import * as React from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDrawerNavHref } from '@/lib/hooks/use-drawer-nav'

type ButtonProps = React.ComponentProps<typeof Button>

type CreateActionButtonProps = Omit<
  ButtonProps,
  'aria-label' | 'asChild' | 'children' | 'size' | 'title'
> & {
  label: string
  href?: string
  size?: 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg'
}

export function CreateActionButton({
  label,
  href,
  size = 'icon-sm',
  variant = 'default',
  ...buttonProps
}: CreateActionButtonProps) {
  const layerHref = useDrawerNavHref()
  if (href) {
    // Open the create drawer while keeping the list's sort/filter/search/page —
    // a same-route `?new=1` href gets layered onto the current URL; a cross-route
    // href (a real navigation) passes through untouched.
    return (
      <Button
        {...buttonProps}
        asChild
        size={size}
        variant={variant}
        aria-label={label}
        title={label}
      >
        <Link href={layerHref(href)}>
          <Plus className="size-4" aria-hidden />
        </Link>
      </Button>
    )
  }

  return (
    <Button
      {...buttonProps}
      size={size}
      variant={variant}
      aria-label={label}
      title={label}
    >
      <Plus className="size-4" aria-hidden />
    </Button>
  )
}
