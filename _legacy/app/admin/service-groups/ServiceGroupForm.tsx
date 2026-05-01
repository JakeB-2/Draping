'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  AppForm, FormScreen, FormHeader, FormSection,
  FormActions, TextField, TextareaField,
} from '@/components/screens/form'
import { createServiceGroup, updateServiceGroup } from '@/lib/actions/service-groups'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})
type Schema = z.infer<typeof schema>

type Props = {
  id?: string
  defaultValues?: Partial<Schema>
}

export default function ServiceGroupForm({ id, defaultValues }: Props) {
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(data: Schema) {
    setError(null)
    const err = id
      ? await updateServiceGroup(id, data)
      : await createServiceGroup(data)
    if (err) { setError(err); return }
    router.push('/admin/service-groups')
  }

  return (
    <FormScreen>
      <FormHeader
        title={id ? 'Edit Service Group' : 'New Service Group'}
        backHref="/admin/service-groups"
      />
      <AppForm
        schema={schema}
        defaultValues={{ name: '', description: '', ...defaultValues }}
        onSubmit={handleSubmit}
      >
        <FormSection>
          <TextField<Schema> name="name" label="Name" required />
          <TextareaField<Schema> name="description" label="Description" span="full" rows={2} />
        </FormSection>
        <FormActions cancelHref="/admin/service-groups" error={error} />
      </AppForm>
    </FormScreen>
  )
}
