'use client'


// URL-driven page-number pagination control for DataTable / EntityListPage.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  currentPage: number
  totalPages: number
}

export default function Paginator({ currentPage, totalPages }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pageHref(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    return `${pathname}?${params.toString()}`
  }

  return (
    // Visible on every width (R-UX-030): phones previously hid this entirely,
    // which made rows beyond the first server page unreachable on lists that
    // aren't reliably searchable. Compact icon labels below md; text labels at md+.
    <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex gap-2">
        {currentPage <= 1 ? (
          <Button variant="outline" size="sm" disabled aria-disabled="true" aria-label="Previous page">
            <ChevronLeft className="size-3.5" />
            <span className="hidden md:inline">Previous</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={pageHref(currentPage - 1)} aria-label="Previous page">
              <ChevronLeft className="size-3.5" />
              <span className="hidden md:inline">Previous</span>
            </Link>
          </Button>
        )}
        {currentPage >= totalPages ? (
          <Button variant="outline" size="sm" disabled aria-disabled="true" aria-label="Next page">
            <span className="hidden md:inline">Next</span>
            <ChevronRight className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={pageHref(currentPage + 1)} aria-label="Next page">
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
