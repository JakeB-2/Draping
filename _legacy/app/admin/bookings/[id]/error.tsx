'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function BookingError({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <Alert variant="destructive" className="max-w-lg">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" size="sm">
        <Link href="/admin/bookings">Back to bookings</Link>
      </Button>
    </div>
  )
}
