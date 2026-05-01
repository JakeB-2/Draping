import { cn } from '@/lib/utils'

const PRIORITY_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  low:    { label: 'Low',    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',   dot: 'bg-slate-400' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   dot: 'bg-blue-500' },
  high:   { label: 'High',   className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500',       dot: 'bg-red-500' },
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] ?? { label: priority, className: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', config.className)}>
      <span className={cn('size-1.5 rounded-full shrink-0', config.dot)} />
      {config.label}
    </span>
  )
}
