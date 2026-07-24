import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { RouteHelpLink } from '@/components/ui/route-help-link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Surface, SectionHeader } from './surface'

// ---------------------------------------------------------------------------
// DetailSection — card wrapper with optional title.
// No inner padding — rows and freeform children supply their own padding.
// ---------------------------------------------------------------------------
export function DetailSection({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  // Title sits above the card (detail-page convention); body is the canonical
  // Surface. Rows pad themselves, so the Surface stays padding-free.
  return (
    <div className="space-y-2">
      {title && <SectionHeader title={title} size="section" className="px-1" />}
      <Surface>{children}</Surface>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DetailHeader — title + optional badge + action slot
// (back button removed — breadcrumbs handle navigation. backHref/backLabel
//  props remain optional for back-compat but are no-ops; sweep callers later.)
// ---------------------------------------------------------------------------
export function DetailHeader({
  title,
  subtitle,
  badge,
  actions,
  helpArticleId,
}: {
  backHref?: string
  backLabel?: string
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  /** Override the route-derived help article. Pass null to hide the icon. */
  helpArticleId?: string | null
}) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
      <div className="flex items-start gap-2 min-w-0">
        <div className="space-y-1 min-w-0">
          {/* Title + help icon stay a no-wrap unit; the badge wraps below on
              narrow screens instead of splitting the icons onto a stray line
              between title and subtitle. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 max-w-full items-center gap-1">
              <h1 className="min-w-0 text-xl font-semibold tracking-tight">{title}</h1>
              <RouteHelpLink articleId={helpArticleId} className="shrink-0" />
            </span>
            {badge}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DetailScreen — full page wrapper
// ---------------------------------------------------------------------------
export function DetailScreen({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl space-y-6">{children}</div>
}

// ---------------------------------------------------------------------------
// DetailTabs — underline tabs, horizontal scroll on overflow
// Single-tab case: render the lone tab's content directly with no tab bar.
// ---------------------------------------------------------------------------
export function DetailTabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: React.ReactNode; content: React.ReactNode }[]
  defaultValue?: string
}) {
  if (tabs.length <= 1) {
    return <div className="mt-2 space-y-4">{tabs[0]?.content}</div>
  }

  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value}>
      <div className="border-b -mx-4 px-4 overflow-x-auto no-scrollbar">
        {/* divide-x puts one vertical 1px border between adjacent triggers
            (skips the first child). Borders inherit border-border via the
            project's global * rule. */}
        <TabsList variant="line" className="w-full justify-start gap-0 divide-x">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              // Top/left/right borders zeroed so the only horizontal line is
              // the parent border-b plus the 2px primary bottom on the
              // active trigger; vertical dividers come from divide-x on the
              // parent. after:hidden kills shadcn's line-variant pseudo bar
              // (would stack with the border-b).
              className="px-3 h-11 text-sm font-medium shrink-0 rounded-none border-x-0 border-t-0 border-b-2 border-transparent -mb-px after:hidden data-active:border-primary data-active:text-primary data-active:bg-transparent data-active:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-2 space-y-4">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Re-export primitives for pages that need lower-level access
// ---------------------------------------------------------------------------
export { Badge, Skeleton }

// ---------------------------------------------------------------------------
// DetailShell — formalized vocabulary for D1/D2/D3 detail pages.
// Slots: Header, Section, Field, Tabs (Meta / Footer added when first used).
// Renders identically to DetailScreen — DetailScreen stays exported for
// existing callers; new code prefers DetailShell + DetailShell.* slots.
// ---------------------------------------------------------------------------
export const DetailShell = Object.assign(DetailScreen, {
  Header: DetailHeader,
  Section: DetailSection,
  Tabs: DetailTabs,
})

// Widget-vocabulary aliases (see components/screens/index.ts catalog).
export const Section = DetailSection
export const TabbedContent = DetailTabs
