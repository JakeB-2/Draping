import type { badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export const BOOKING_STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'pending',   label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]['value']

export const STATUS_BADGE_VARIANTS: Record<BookingStatus, BadgeVariant> = {
  draft:     'outline',
  pending:   'outline',
  confirmed: 'default',
  cancelled: 'destructive',
  completed: 'secondary',
}
