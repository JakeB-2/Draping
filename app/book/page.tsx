import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { getActiveSnapshot } from '@/lib/snapshot'
import { BookingFlow } from './booking-flow'

async function BookingContent() {
  const snapshot = await getActiveSnapshot()

  if (!snapshot || snapshot.offerings.length === 0) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-4">
        <h1 className="text-2xl font-light">Not currently accepting bookings</h1>
        <p className="text-muted-foreground">
          The booking system is still being set up. Please check back soon.
        </p>
      </div>
    )
  }

  return <BookingFlow snapshot={snapshot} />
}

function FlowSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function BookPage() {
  return (
    <Suspense fallback={<FlowSkeleton />}>
      <BookingContent />
    </Suspense>
  )
}
