import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingEditor } from '../../booking-editor'
import { loadBookingForEditor, loadEditorOptions } from '../../editor-data'

async function EditBookingContent({ id }: { id: string }) {
  const initial = await loadBookingForEditor(id)
  if (!initial) notFound()
  const options = await loadEditorOptions(initial.offering_id)
  return <BookingEditor mode="revise" initial={initial} {...options} />
}

export default function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditBookingSkeleton />}>
      <EditBookingRoute params={params} />
    </Suspense>
  )
}

async function EditBookingRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link href={`/admin/bookings?selected=${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Booking details</Link>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-2xl font-light">Revise booking</h1>
        </div>
      </header>
      <EditBookingContent id={id} />
    </div>
  )
}

function EditBookingSkeleton() {
  return <div className="mx-auto max-w-6xl"><Skeleton className="h-[42rem]" /></div>
}

