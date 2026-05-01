import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// DetailField — label + value row
// ---------------------------------------------------------------------------
export function DetailField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? '—'}</span>
    </>
  )
}

// ---------------------------------------------------------------------------
// DetailSection — card with optional title
// ---------------------------------------------------------------------------
export function DetailSection({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {title && (
        <>
          <div className="px-4 md:px-6 py-4">
            <h2 className="text-sm font-medium">{title}</h2>
          </div>
          <Separator />
        </>
      )}
      <div className="px-4 md:px-6 py-4 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-8 gap-y-2">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DetailHeader — back link + title + optional badge + action slot
// ---------------------------------------------------------------------------
export function DetailHeader({
  backHref,
  backLabel = 'Back',
  title,
  subtitle,
  badge,
  actions,
}: {
  backHref: string
  backLabel?: string
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-medium">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <Button variant="outline" size="sm" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
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
// DetailTabs — tab shell; pages only supply names + content
// ---------------------------------------------------------------------------
export function DetailTabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: string; content: React.ReactNode }[]
  defaultValue?: string
}) {
  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-4 space-y-4">
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
