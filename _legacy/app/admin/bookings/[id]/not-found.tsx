import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function BookingNotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Booking not found</h1>
      <p className="text-muted-foreground text-sm">
        This booking doesn&apos;t exist or may have been deleted.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/admin/bookings">Back to bookings</Link>
      </Button>
    </div>
  )
}
