'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  AppForm, FormScreen, FormHeader, FormSection,
  FormActions, TextField, TextareaField, SelectField,
  NumberField, CheckboxField,
} from '@/components/screens/form'
import { createService, updateService } from '@/lib/actions/services'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  service_group_id: z.string().min(1, 'Service group is required'),
  time_requirement_minutes: z.number().min(1, 'Must be at least 1 minute'),
  is_active: z.boolean(),
})
type Schema = z.infer<typeof schema>

type ServiceGroup = { id: string; name: string }

type Props = {
  id?: string
  defaultValues?: Partial<Schema>
  serviceGroups: ServiceGroup[]
}

export default function ServiceForm({ id, defaultValues, serviceGroups }: Props) {
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const groupOptions = serviceGroups.map((g) => ({ label: g.name, value: g.id }))

  async function handleSubmit(data: Schema) {
    setError(null)
    const err = id
      ? await updateService(id, data)
      : await createService(data)
    if (err) { setError(err); return }
    router.push('/admin/services')
  }

  return (
    <FormScreen>
      <FormHeader
        title={id ? 'Edit Service' : 'New Service'}
        backHref="/admin/services"
      />
      <AppForm
        schema={schema}
        defaultValues={{
          name: '',
          description: '',
          service_group_id: '',
          time_requirement_minutes: 60,
          is_active: true,
          ...defaultValues,
        }}
        onSubmit={handleSubmit}
      >
        <FormSection title="Details">
          <TextField<Schema> name="name" label="Name" required />
          <SelectField<Schema>
            name="service_group_id"
            label="Service Group"
            options={groupOptions}
            required
          />
          <TextareaField<Schema> name="description" label="Description" span="full" rows={2} />
        </FormSection>
        <FormSection title="Time & Status">
          <NumberField<Schema>
            name="time_requirement_minutes"
            label="Duration (minutes)"
            required
            min={1}
          />
          <div className="flex items-end pb-1">
            <CheckboxField<Schema> name="is_active" label="Active (visible to clients)" />
          </div>
        </FormSection>
        <FormActions cancelHref="/admin/services" error={error} />
      </AppForm>
    </FormScreen>
  )
}
