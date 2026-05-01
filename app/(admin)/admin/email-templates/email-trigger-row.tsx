'use client'

import { useState, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateEmailTrigger, type EmailTrigger } from './trigger-actions'

type Template = { id: string; name: string }

export function EmailTriggerRow({ trigger, templates }: { trigger: EmailTrigger; templates: Template[] }) {
  const [templateId, setTemplateId] = useState<string>(trigger.template_id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleTemplateChange(value: string) {
    const next = value === '__none__' ? null : value
    setTemplateId(next ?? '')
    startTransition(async () => {
      const err = await updateEmailTrigger(trigger.id, { template_id: next })
      setError(err ?? null)
    })
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 border-b last:border-0">
      <p className="font-medium text-sm">{trigger.label}</p>
      <div className="w-56">
        <Select
          value={templateId || '__none__'}
          onValueChange={handleTemplateChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-full text-sm">
            <SelectValue placeholder="No email" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No email</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    </div>
  )
}
