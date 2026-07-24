'use client'

// Bookings list pane for the /admin/bookings SplitView. Selection is URL-driven
// (?selected=<id>) via useUrlRowSelection; DataTable owns search, sort, the
// status facet filter, and the phone card layout.

import { useMemo } from 'react'
import DataTable, { type Column, type FilterDef } from '@/components/tables/DataTable'
import { useUrlRowSelection } from '@/components/screens/use-url-row-selection'
import { formatInTimeZone } from '@/lib/time-zone'
import { StatusBadge } from './status-badge'

export type BookingListRow = {
  id: string
  starts_at: string
  status: string
  participant_count: number
  duration_minutes: number
  offering_name: string | null
  client_label: string
}

const FILTERS: FilterDef<BookingListRow>[] = [
  {
    label: 'Status',
    accessor: 'status',
    options: ['pending', 'confirmed', 'completed', 'cancelled'].map((status) => ({
      label: status,
      value: status,
    })),
  },
]

const SEARCH_KEYS: (keyof BookingListRow)[] = ['client_label', 'offering_name']

export function BookingsTable({
  data,
  selectedId,
  timezone,
}: {
  data: BookingListRow[]
  selectedId?: string | null
  timezone: string
}) {
  const { selectRow } = useUrlRowSelection(selectedId)

  const columns = useMemo<Column<BookingListRow>[]>(() => [
    {
      header: 'Client(s)',
      accessor: (row) => row.client_label || '—',
      sortKey: 'client_label',
      sortable: true,
      mobile: 'title',
    },
    {
      header: 'Offering',
      accessor: (row) => row.offering_name ?? 'Unknown offering',
      sortKey: 'offering_name',
      sortable: true,
      mobile: 'subtitle',
    },
    {
      header: 'Start',
      accessor: (row) =>
        formatInTimeZone(row.starts_at, timezone, { dateStyle: 'medium', timeStyle: 'short' }),
      sortKey: 'starts_at',
      sortable: true,
      cellClassName: 'whitespace-nowrap tabular-nums',
      mobile: 'metadata',
    },
    {
      header: 'Duration',
      accessor: (row) => `${row.duration_minutes} min`,
      sortKey: 'duration_minutes',
      sortable: true,
      className: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'lg',
    },
    {
      header: 'People',
      accessor: (row) => row.participant_count,
      sortKey: 'participant_count',
      sortable: true,
      className: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'lg',
    },
    {
      header: 'Status',
      accessor: (row) => <StatusBadge status={row.status} />,
      sortKey: 'status',
      sortable: true,
      mobile: 'signal',
    },
  ], [timezone])

  return (
    <DataTable
      data={data}
      columns={columns}
      searchKeys={SEARCH_KEYS}
      searchPlaceholder="Search client or offering…"
      filters={FILTERS}
      emptyMessage="No bookings."
      onRowClick={(row) => selectRow(row.id)}
      selectedId={selectedId}
      pageSize={25}
    />
  )
}
