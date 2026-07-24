'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatInTimeZone } from '@/lib/time-zone'
import { publishSnapshot } from './actions'

export function PublishButton({ lastPublished, timezone }: { lastPublished: string | null; timezone: string }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await publishSnapshot()
      if (result.ok) toast.success('Public site updated')
      else toast.error(result.error)
    })
  }

  const fmt = (iso: string) =>
    formatInTimeZone(iso, timezone, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-muted-foreground">
        {lastPublished ? <>Last published <span className="text-foreground">{fmt(lastPublished)}</span></> : 'Never published'}
      </p>
      <Button onClick={onClick} disabled={pending} size="sm">
        {pending ? 'Publishing…' : 'Publish'}
      </Button>
    </div>
  )
}
