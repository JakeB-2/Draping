'use client'

import { Fragment, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RouteHelpLink } from '@/components/ui/route-help-link'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type SubSidebarItem = {
  label: string
  href: string
  /** Optional trailing glyph (e.g. a settings-tier indicator) shown after the label. */
  indicator?: React.ReactNode
}
export type SubSidebarSection = { group: string; items: SubSidebarItem[] }

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function findActiveItem(sections: SubSidebarSection[], pathname: string): SubSidebarItem | undefined {
  for (const section of sections) {
    const match = section.items.find((item) => isActive(pathname, item.href))
    if (match) return match
  }
  return undefined
}

/**
 * Persistent left list — only visible at md+ breakpoints.
 *
 * Flat grouped list (the Help Center `HelpNav` grammar): every section's items
 * stay visible under a hairline-underlined group label. Deliberately NOT an
 * accordion — the sub-nav reads as one quiet scannable column, not a stack of
 * expandable cards.
 */
export function SubSidebarDesktop({
  sections,
  ariaLabel,
}: {
  sections: SubSidebarSection[]
  ariaLabel?: string
}) {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement | null>(null)
  // After navigating to a settings item, the just-selected row can land below
  // the fold of a 38-item column. Reveal it on each route change; `block:
  // 'nearest'` only scrolls when the row is actually off-screen, so an already
  // visible selection doesn't jump.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [pathname])
  return (
    <nav aria-label={ariaLabel} className="space-y-5 min-h-0 flex-1 overflow-y-auto pb-4">
      {sections.map((section) => (
        <div key={section.group}>
          <p className="px-2 mb-1.5 pb-1 text-xs font-semibold text-foreground border-b border-border/60">
            {section.group}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    ref={active ? activeRef : undefined}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors',
                      // Active item matches the main sidebar's brand treatment
                      // (soft primary fill + primary text) so "you are here"
                      // reads the same at every nav level (R-UX-044). Hover
                      // stays neutral grey.
                      active
                        ? 'bg-primary-soft text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.indicator && <span className="shrink-0">{item.indicator}</span>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Layout shell for a section with a sub-sidebar. Renders the section title
 * above the sub-nav in the left column on desktop (so the right-hand content
 * starts at the top of the row), and stacks the title + dropdown above the
 * content on mobile.
 */
export function SubSidebarLayout({
  title,
  description,
  sections,
  ariaLabel,
  children,
}: {
  title: string
  description?: string
  sections: SubSidebarSection[]
  ariaLabel?: string
  children: React.ReactNode
}) {
  const heading = (
    <div>
      <div className="flex items-center gap-1.5">
        <h1 className="text-title font-medium">{title}</h1>
        <RouteHelpLink />
      </div>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
  return (
    <div className="md:flex md:gap-8 md:items-start">
      {/* Desktop sub-nav is its own bounded, sticky column: the heading stays
          pinned while the 38-item list scrolls independently of page content
          (sticky to the SidebarInset scrollport, which starts flush at the top
          on md+). SubSidebarDesktop's <nav> is the flex-1 scroll region. */}
      <div className="hidden md:flex md:flex-col w-52 shrink-0 sticky top-0 max-h-dvh gap-5">
        {heading}
        <SubSidebarDesktop sections={sections} ariaLabel={ariaLabel} />
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Mobile header: a small area eyebrow + the section picker styled as the
            page title. The dropdown is the single carrier of the current
            section's name on phones — every settings page below suppresses its
            own redundant content title under md (R-UX-027). The big "Settings"
            h1 + description stay desktop-only in the left column above. */}
        <div className="md:hidden space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-meta font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {title}
            </span>
            <RouteHelpLink />
          </div>
          <SubSidebarMobile sections={sections} ariaLabel={ariaLabel} asTitle />
        </div>
        {children}
      </div>
    </div>
  )
}

/** Compact section dropdown — only visible below md. */
export function SubSidebarMobile({
  sections,
  ariaLabel,
  asTitle = false,
}: {
  sections: SubSidebarSection[]
  ariaLabel?: string
  /**
   * Render the trigger as the page title (larger text, full width). The settings
   * mobile header uses this so the section picker IS the page heading — the page
   * content then renders no separate title under md.
   */
  asTitle?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const active = findActiveItem(sections, pathname)
  return (
    <div className="md:hidden">
      <Select value={active?.href ?? ''} onValueChange={(v) => router.push(v)}>
        <SelectTrigger
          aria-label={ariaLabel}
          className={cn('w-full', asTitle && 'h-auto py-2 text-record font-semibold text-foreground')}
        >
          <SelectValue placeholder="Jump to section" />
        </SelectTrigger>
        <SelectContent>
          {sections.map((section, i) => (
            <Fragment key={section.group}>
              {i > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold text-foreground">
                  {section.group}
                </SelectLabel>
                {section.items.map((item) => (
                  <SelectItem key={item.href} value={item.href}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </Fragment>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
