'use client'

// useDrawerNavHref — client wrapper over the drawer-nav rule (lib/nav/
// preserve-drawer-nav.ts). Returns a stable `layer(targetHref)` that rewrites a
// drawer-navigation href so it keeps the current list's sort / filter / search /
// page. Same-route only; a cross-route target passes through untouched.
//
// Used by every drawer navigation chokepoint (create-open button, edit-open
// link, post-save redirect, cancel) so opening/saving/cancelling a drawer can't
// reset the table the user sorted.

import { useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { layerDrawerHrefOntoCurrentUrl } from '@/lib/nav/preserve-drawer-nav'

export function useDrawerNavHref(): (targetHref: string) => string {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return useCallback(
    (targetHref: string) =>
      layerDrawerHrefOntoCurrentUrl({
        targetHref,
        currentPathname: pathname,
        currentSearch: searchParams.toString(),
      }),
    [pathname, searchParams],
  )
}
