import type { ReactNode } from 'react'
import { RouteHelpLink } from '@/components/ui/route-help-link'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Surface + SectionHeader — the canonical card grammar (Phase 2C).
//
// Before this, ~5 components each drew "a bordered card with a header" their
// own way (rounded-lg vs rounded-xl, four different title sizes, one-off
// borders). DetailSection / FormSection / SectionStack now
// compose these, so the radius, elevation, and title scale live in ONE place.
//
// Elevation rule (locked in 2A): a surface gets a BORDER or a TINT, never both.
//   - default  → border + bg-card   (the standard lifted sheet)
//   - tinted   → bg-surface-2, NO border (a nested "tray"; children stay
//                borderless and rely on dividers)
//   - elevated → border + bg-card + soft shadow (floats above the page)
// This is what makes the old triple-nested "card in a card in a card" look
// impossible to express by accident.
// ---------------------------------------------------------------------------

export type SurfaceProps = {
  /** Add the standard raised shadow (page/drawer/popover sheet). */
  elevated?: boolean
  /** Tinted tray: bg-surface-2 with NO border (border XOR tint). */
  tinted?: boolean
  className?: string
  children: ReactNode
}

export function Surface({ elevated = false, tinted = false, className, children }: SurfaceProps) {
  return (
    <div
      data-slot="surface"
      className={cn(
        'overflow-hidden rounded-lg',
        // elevated = LIFT: a soft shadow carries the separation instead of a
        // border (border XOR everything-else). Use on a tinted canvas so the
        // white card floats. tinted = a flat tray, no border. default = border.
        tinted
          ? 'bg-surface-2'
          : elevated
            ? 'bg-card shadow-[var(--elevation-raised)]'
            : 'border bg-card',
        className,
      )}
    >
      {children}
    </div>
  )
}

// One title treatment, three sizes on the type scale:
//   section — card / section header   (14px / 600)        — the common case
//   record  — record / panel header   (17px / 600)        — drawer & group panels
//   eyebrow — uppercase overline       (11px / 600 / caps)  — dense sub-labels
const HEADER_SIZE: Record<'section' | 'record' | 'eyebrow', string> = {
  section: 'text-section font-semibold leading-tight',
  record: 'text-record font-semibold leading-tight tracking-[-0.01em]',
  eyebrow: 'text-eyebrow font-semibold uppercase tracking-[0.06em] text-muted-foreground',
}

export type SectionHeaderProps = {
  title?: ReactNode
  size?: 'section' | 'record' | 'eyebrow'
  subtitle?: ReactNode
  /** Right-aligned action cluster. */
  actions?: ReactNode
  /** Inline nodes after the title (badges, counts, help hints). */
  badges?: ReactNode
  /** Render a help icon when defined (pass null to force-hide). Omit entirely
   *  to render no help affordance at all. */
  helpArticleId?: string | null
  /** Render as an in-card header bar (bottom border + standard padding). */
  divider?: boolean
  className?: string
}

export function SectionHeader({
  title,
  size = 'section',
  subtitle,
  actions,
  badges,
  helpArticleId,
  divider = false,
  className,
}: SectionHeaderProps) {
  if (title == null && actions == null && badges == null && subtitle == null) return null
  return (
    <div className={cn(divider && 'border-b px-3 py-2.5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {title != null &&
            (typeof title === 'string' ? <h2 className={cn('truncate', HEADER_SIZE[size])}>{title}</h2> : title)}
          {helpArticleId !== undefined && <RouteHelpLink articleId={helpArticleId} />}
          {badges}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {subtitle != null && <div className="mt-1 text-body text-muted-foreground">{subtitle}</div>}
    </div>
  )
}
