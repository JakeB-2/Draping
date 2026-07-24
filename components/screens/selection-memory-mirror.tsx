'use client'

// Mirrors the URL `?selected=<id>` value to sessionStorage so the hub-tab bar
// can restore it when the user flips back to this tab. URL is the source of
// truth; storage is purely a passive shadow. When `?selected` is absent
// (post-delete redirect, "new" click, X button), storage is cleared atomically
// so it can never resurrect a cleared selection.

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export function SelectionMemoryMirror({ storageKey }: { storageKey: string }) {
  const searchParams = useSearchParams()
  const selected = searchParams.get('selected')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selected) {
      sessionStorage.setItem(storageKey, selected)
    } else {
      sessionStorage.removeItem(storageKey)
    }
    // Notify same-tab listeners (HubTabBar uses useSyncExternalStore against
    // a custom event since the native `storage` event only fires cross-tab).
    window.dispatchEvent(new CustomEvent('selection-memory-change', { detail: { storageKey } }))
  }, [selected, storageKey])

  return null
}
