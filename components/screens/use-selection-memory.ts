import { useSyncExternalStore } from 'react'

// Shared L2-tab selection-memory hook, consumed by both the desktop tab row
// (hub-shell.tsx `HubTabLink`) and the mobile popover row (HubTabMenu.tsx
// `TabMenuRow`). Both surfaces are the same hub navigation, so the subscribe +
// snapshot + "?selected= only when inactive" grammar must stay identical — it
// previously lived as a verbatim copy in each file and could silently drift.

// Subscribe to a custom DOM event the SelectionMemoryMirror dispatches when the
// URL `?selected=` value changes. Cross-tab updates also flow via the native
// `storage` event. The server snapshot is `null` so SSR matches the
// "no value yet" client render.
export function subscribeSelectionMemory(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const onCustom = () => callback()
  const onStorage = () => callback()
  window.addEventListener('selection-memory-change', onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('selection-memory-change', onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

export function getSelectionMemorySnapshot(key: string): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(key)
}

export function useSelectionMemory(key: string | undefined): string | null {
  return useSyncExternalStore(
    subscribeSelectionMemory,
    () => (key ? getSelectionMemorySnapshot(key) : null),
    () => null,
  )
}

type TabHrefInput = { href: string; selectionMemoryKey?: string }

/**
 * Resolve a tab's href, appending `?selected=<memorised id>` only when the tab
 * is inactive — the active tab's URL already carries the truth, and rewriting it
 * via memory would race the mirror's writeback.
 */
export function useTabHref(tab: TabHrefInput, active: boolean): string {
  const memorisedId = useSelectionMemory(active ? undefined : tab.selectionMemoryKey)
  return !active && memorisedId
    ? `${tab.href}?selected=${encodeURIComponent(memorisedId)}`
    : tab.href
}
