import { Badge } from '@/components/ui/badge'
import { BOOKING_STATUSES, STATUS_BADGE_VARIANTS, type BookingStatus } from '@/lib/schemas/booking'

export function BookingStatusBadge({ status }: { status: string }) {
  const variant = STATUS_BADGE_VARIANTS[status as BookingStatus] ?? 'secondary'
  const label = BOOKING_STATUSES.find(s => s.value === status)?.label ?? status
  return <Badge variant={variant}>{label}</Badge>
}
