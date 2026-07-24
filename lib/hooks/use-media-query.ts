'use client'

import { useEffect, useState } from 'react'

/**
 * useMediaQuery — subscribe to a CSS media query and re-render on changes.
 *
 * SSR-safe: returns `false` during server render and the first client render is
 * corrected synchronously from `matchMedia` (the `useState` initialiser reads it
 * on the client). Consumers that only branch on the result while a portal/overlay
 * is closed (the common case) see no hydration flash because the branched DOM
 * isn't mounted until the user opens it.
 *
 * Generic on purpose: it powers the work-entry editor's viewport→presentation
 * choice today, but stays a plain media-query primitive so a container-width
 * strategy can later be swapped in without changing call sites that just need
 * "is this viewport wide?".
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    // iPad Safari can fire a change against a transient bogus viewport while
    // backgrounded and swallow the reverse event while the page is frozen,
    // leaving stale state on resume — re-sync when the page becomes visible.
    window.addEventListener('pageshow', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      mql.removeEventListener('change', handler)
      window.removeEventListener('pageshow', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [query])

  return matches
}

/**
 * Device-neutral INPUT-ergonomics axis (capability-based), kept deliberately
 * SEPARATE from the width/layout axis (`useIsMobile`, `useMediaQuery('(min-width:768px)')`,
 * the locked 768 reflow grammar). The two axes must never be conflated into one
 * "isMobile" — a touch laptop is coarse-pointer AND wide, and should keep the
 * desktop *layout* while getting touch *ergonomics*.
 *
 * Query policy (the load-bearing correctness rule):
 *  - "Device can be TOUCHED" → `(any-pointer: coarse)`. Use to enlarge tap
 *    targets and surface tap affordances. `(pointer: coarse)` is WRONG here: it
 *    reports only the PRIMARY pointer, so a trackpad-primary touch laptop
 *    reports `fine` and would be starved.
 *  - "No reliable HOVER" → `(hover: none)`. Use to replace hover-only reveals
 *    (tooltip → popover, hover-expand → tap-expand). A hybrid laptop with a
 *    mouse reports `(hover: hover)`, so it correctly keeps the hover affordance
 *    while still getting larger tap targets from `usePointerCoarse()`.
 *
 * The matching CSS layer uses `@media (any-pointer: coarse)` / `@media (hover: none)`
 * blocks and the Tailwind `pointer-coarse:` variant (simple cases only).
 */
export function usePointerCoarse(): boolean {
  return useMediaQuery('(any-pointer: coarse)')
}

/** True when the device has no reliable hover (pure touch). See policy above. */
export function useHoverNone(): boolean {
  return useMediaQuery('(hover: none)')
}
