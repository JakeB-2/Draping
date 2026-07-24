'use client'

// Vendored-stub of protec-portal's RouteHelpLink (2026-07-24 component port).
//
// In protec-portal this renders a contextual "?" help-popover wired to that
// app's Help Center (business-profile context + lib/help/route-links). Draping
// has no help center, so the ported screens/tables components render nothing
// here — the prop API is kept intact so the vendored files stay verbatim and
// call sites translate 1:1. If draping ever grows contextual help, implement
// it in this file and every ported surface lights up at once.

export function RouteHelpLink({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  articleId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
}: {
  /** Override the route-derived article. Pass null to hide the icon. */
  articleId?: string | null
  className?: string
}) {
  return null
}
