'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { isDrawerContextParam } from '@/lib/nav/preserve-drawer-nav'

export type UrlRowSelectionOptions = {
  /**
   * Extra drawer/param keys to clear whenever the selection changes or a create
   * drawer is opened, e.g. a secondary entity's `selected_doc`. The primary
   * selected/new/edit keys are always managed; list only the extras.
   */
  extraClearOnSelect?: readonly string[]
  /**
   * Override the primary param keys for a secondary entity living in the same
   * hub (drawer URL grammar: `selected_<entity>` / `new_<entity>` / `edit_<entity>`).
   * Defaults are the primary `selected` / `new` / `edit`.
   */
  selectedParam?: string
  newParam?: string
  editParam?: string
  /** Params always force-set on select/new for routes that need a discriminator. */
  pinned?: Record<string, string>
}

function resolveParams(options?: UrlRowSelectionOptions) {
  return {
    selectedParam: options?.selectedParam ?? 'selected',
    newParam: options?.newParam ?? 'new',
    editParam: options?.editParam ?? 'edit',
    extraClear: options?.extraClearOnSelect ?? [],
    pinned: options?.pinned ?? {},
  }
}

// Pure URL math, exported and unit-tested so the drawer-param grammar cannot
// silently regress. The hook below is a thin next/navigation wrapper.

// One-shot context params (create prefill like `client_id`, back-links like
// `from_booking`) expire with the drawer state they arrived with — see
// lib/nav/preserve-drawer-nav. Callers that WANT prefill on a create drawer
// pass it via `extra`, which is applied after this cleanup.
function clearDrawerContext(params: URLSearchParams) {
  for (const key of [...params.keys()]) {
    if (isDrawerContextParam(key)) params.delete(key)
  }
}

/** Toggle the selected param, always clearing new/edit (+ extras) and applying pinned. `id === selectedId` or `null` clears it. */
export function buildRowSelectionUrl(
  pathname: string,
  search: string,
  selectedId: string | null | undefined,
  id: string | null,
  options?: UrlRowSelectionOptions,
): string {
  const { selectedParam, newParam, editParam, extraClear, pinned } = resolveParams(options)
  const params = new URLSearchParams(search)
  params.delete(newParam)
  params.delete(editParam)
  for (const key of extraClear) params.delete(key)
  clearDrawerContext(params)
  for (const [key, value] of Object.entries(pinned)) params.set(key, value)

  if (id === null || selectedId === id) {
    params.delete(selectedParam)
  } else {
    params.set(selectedParam, id)
  }

  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** Build the create-drawer href: clears selected/edit (+ extras), applies pinned, sets new=1, layers `extra`. */
export function buildCreateDrawerUrl(
  pathname: string,
  search: string,
  options?: UrlRowSelectionOptions,
  extra?: Record<string, string>,
): string {
  const { selectedParam, newParam, editParam, extraClear, pinned } = resolveParams(options)
  const params = new URLSearchParams(search)
  params.delete(selectedParam)
  params.delete(editParam)
  for (const key of extraClear) params.delete(key)
  clearDrawerContext(params)
  for (const [key, value] of Object.entries(pinned)) params.set(key, value)
  params.set(newParam, '1')
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** Clear only the create-drawer param (`new`), preserving every other param
 *  (selection, filters, page). For closing a URL-driven create drawer/sheet
 *  without disturbing the underlying list or selection. */
export function buildClearNewUrl(
  pathname: string,
  search: string,
  options?: UrlRowSelectionOptions,
): string {
  const { newParam } = resolveParams(options)
  const params = new URLSearchParams(search)
  params.delete(newParam)
  clearDrawerContext(params)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * Canonical URL-driven row selection for split-view / drawer tables. Owns the
 * selected toggle and the new/edit drawer-param cleanup so opening a row cannot
 * leave a stale create/edit drawer stacked over the new detail.
 */
export function useUrlRowSelection(
  selectedId?: string | null,
  options?: UrlRowSelectionOptions,
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function selectRow(id: string | null) {
    router.replace(
      buildRowSelectionUrl(pathname, searchParams.toString(), selectedId, id, options),
      { scroll: false },
    )
  }

  /** The create-drawer href (`?new=1`), for `CreateActionButton href=`. */
  function newHref(extra?: Record<string, string>) {
    return buildCreateDrawerUrl(pathname, searchParams.toString(), options, extra)
  }

  /** Navigate to the create drawer (for onClick handlers that cannot use href). */
  function openNew(extra?: Record<string, string>) {
    router.replace(newHref(extra), { scroll: false })
  }

  /** Close a URL-driven create drawer by clearing `?new=1`, keeping selection/filters. */
  function clearNew() {
    router.replace(
      buildClearNewUrl(pathname, searchParams.toString(), options),
      { scroll: false },
    )
  }

  // Selected row = soft teal fill + a teal left bar, matching DataTable's
  // `selectedId` prop and the SectionStack section-pill language.
  function selectedRowClassName(id: string) {
    return id === selectedId
      ? 'bg-primary-soft hover:bg-primary-soft shadow-[inset_3px_0_0_0_var(--primary)]'
      : undefined
  }

  return { selectRow, newHref, openNew, clearNew, selectedRowClassName }
}
