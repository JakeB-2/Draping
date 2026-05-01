/**
 * ChangeRequestStatusBadge — colour-coded pill for a change_request status.
 *
 * Statuses:
 *   pending  — yellow  (awaiting manager review)
 *   approved — blue    (approved, booking change being applied)
 *   applied  — green   (booking change successfully applied)
 *   rejected — red     (manager rejected)
 *   reviewed — green   (bug report acknowledged)
 */

import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  applied:  { label: 'Applied',  className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  reviewed: { label: 'Reviewed', className: 'bg-green-100 text-green-800 border-green-200' },
}

export function ChangeRequestStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
