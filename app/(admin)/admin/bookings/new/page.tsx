import { Suspense } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingEditor } from '../booking-editor'
import { loadEditorOptions } from '../editor-data'

async function NewBookingContent() {
  const options = await loadEditorOptions()
  return <BookingEditor mode="create" {...options} />
}

export default function NewBookingPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link href="/admin/bookings" className="text-sm text-muted-foreground hover:text-foreground">← Bookings</Link>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-2xl font-light">Create booking</h1>
        </div>
      </header>
      <Suspense fallback={<EditorSkeleton />}>
        <NewBookingContent />
      </Suspense>
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-52" />)}</div>
      <Skeleton className="h-80" />
    </div>
  )
}

