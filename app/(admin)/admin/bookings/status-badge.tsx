import { Badge } from '@/components/ui/badge'

export type BookingStatus = 'draft' | 'pending' | 'confirmed' | 'cancelled' | 'completed'

const variants: Record<BookingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  pending: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
  completed: 'outline',
}

export function StatusBadge({ status }: { status: BookingStatus | string }) {
  const variant = (variants as Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>)[status] ?? 'outline'
  return <Badge variant={variant}>{status}</Badge>
}
