import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// DashboardScreen — top-level page wrapper
// Use at the root of every section landing page / dashboard page.
// ---------------------------------------------------------------------------
export function DashboardScreen({ children }: { children: React.ReactNode }) {
  return <div className="max-w-4xl space-y-8">{children}</div>
}

// ---------------------------------------------------------------------------
// DashboardHeader — page title + optional subtitle
// ---------------------------------------------------------------------------
export function DashboardHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div>
      <h1 className="text-lg font-medium">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardSection — labeled group of cards
// Wrap any grid of cards in this. Use `cols` to control column count.
// Use `title` to add a section label above the grid (e.g. "Quick access").
// ---------------------------------------------------------------------------
const GRID_COLS = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

export function DashboardSection({
  title,
  cols = 2,
  children,
}: {
  title?: string
  cols?: 1 | 2 | 3 | 4
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      {title && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
          <Separator />
        </div>
      )}
      <div className={cn('grid grid-cols-1 gap-4', GRID_COLS[cols])}>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionLinkCard — navigation card that links to a sub-section
// The primary building block for section landing pages (e.g. Dive Operations).
// ---------------------------------------------------------------------------
export function SectionLinkCard({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string
  icon: React.ElementType
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-card p-5 flex items-start gap-4 hover:bg-accent transition-colors"
    >
      <Icon className="size-5 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// StatCard — a single metric displayed in a card
// `value`   — the primary number or string to display
// `label`   — the metric name shown below the value
// `badge`   — optional Badge element in the top-right (e.g. trend, status)
// `sub`     — optional footnote below the value (e.g. "vs last month")
// `progress`— optional 0–100 value that renders a Progress bar at the bottom
//
// Example:
//   <StatCard label="Total staff" value={24} badge={<Badge variant="secondary">Active</Badge>} />
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  badge,
  sub,
  progress,
}: {
  label: string
  value: React.ReactNode
  badge?: React.ReactNode
  sub?: string
  progress?: number
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {badge && <CardAction>{badge}</CardAction>}
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {(sub || progress !== undefined) && (
        <CardContent className="space-y-2">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {progress !== undefined && <Progress value={progress} />}
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// AlertBanner — an info, warning, or error notice at the top of a dashboard
// `variant`     — 'default' (neutral/info) | 'destructive' (error/warning)
// `icon`        — optional lucide icon element (e.g. <Info className="..." />)
// `title`       — bold heading text
// `description` — body text below the title
// `action`      — optional ReactNode placed top-right (e.g. a dismiss button)
//
// Example:
//   <AlertBanner
//     variant="destructive"
//     icon={<AlertTriangle />}
//     title="Payroll overdue"
//     description="3 salaries have no end date set."
//   />
// ---------------------------------------------------------------------------
export function AlertBanner({
  variant = 'default',
  icon,
  title,
  description,
  action,
}: {
  variant?: 'default' | 'destructive'
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Alert variant={variant}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  )
}

// ---------------------------------------------------------------------------
// BadgeVariants re-export — convenience for dashboard pages
// Use these directly without importing from @/components/ui/badge each time.
// ---------------------------------------------------------------------------
export { Badge }
