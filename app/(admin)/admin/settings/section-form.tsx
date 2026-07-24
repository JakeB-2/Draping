'use client'

// Shared presentation pieces for the per-section settings forms. Same look as
// the old single-page settings form (title/description column + field grid),
// just reusable across the sub-pages.

import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Skeleton } from '@/components/ui/skeleton'

export function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="md:col-span-1">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

export function Field({ label, htmlFor, hint, colSpan, required, children }: { label: string; htmlFor: string; hint?: string; colSpan?: number; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${colSpan === 2 ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={htmlFor}>{label}{required && <RequiredMark />}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SectionSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
