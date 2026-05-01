'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  AppForm, FormScreen, FormHeader, FormSection,
  FormActions, TextField, TextareaField, NumberField, CheckboxField,
} from '@/components/screens/form'
import { MultiSelectField } from '@/components/tasks/MultiSelectField'
import { createOffering, updateOffering } from '@/lib/actions/offerings'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  duration_minutes: z.number().min(1, 'Must be at least 1 minute'),
  price_amount: z.number().min(0, 'Must be 0 or more'),
  break_required: z.boolean(),
  pair_allowed: z.boolean(),
  is_active: z.boolean(),
  service_ids: z.array(z.string()),
})
type Schema = z.infer<typeof schema>

type Service = { id: string; name: string }

type Props = {
  id?: string
  defaultValues?: Partial<Schema>
  services: Service[]
}

export default function OfferingForm({ id, defaultValues, services }: Props) {
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const serviceOptions = services.map((s) => ({ label: s.name, value: s.id }))

  async function handleSubmit(data: Schema) {
    setError(null)
    const err = id
      ? await updateOffering(id, data)
      : await createOffering(data)
    if (err) { setError(err); return }
    router.push('/admin/offerings')
  }

  return (
    <FormScreen>
      <FormHeader
        title={id ? 'Edit Offering' : 'New Offering'}
        backHref="/admin/offerings"
      />
      <AppForm
        schema={schema}
        defaultValues={{
          name: '',
          description: '',
          duration_minutes: 60,
          price_amount: 0,
          break_required: false,
          pair_allowed: false,
          is_active: true,
          service_ids: [],
          ...defaultValues,
        }}
        onSubmit={handleSubmit}
      >
        <FormSection title="Details">
          <TextField<Schema> name="name" label="Name" required />
          <TextareaField<Schema> name="description" label="Description" span="full" rows={2} />
        </FormSection>

        <FormSection title="Pricing & Duration">
          <NumberField<Schema>
            name="duration_minutes"
            label="Total Duration (minutes)"
            required
            min={1}
          />
          <NumberField<Schema>
            name="price_amount"
            label="Price ($)"
            required
            min={0}
            step={0.01}
          />
        </FormSection>

        <FormSection title="Options">
          <div className="flex flex-col gap-3">
            <CheckboxField<Schema> name="break_required" label="Break included in this offering" />
            <CheckboxField<Schema> name="pair_allowed" label="Can be booked as a pair (2 clients)" />
            <CheckboxField<Schema> name="is_active" label="Active (bookable by clients)" />
          </div>
          <div>
            <MultiSelectField<Schema>
              name="service_ids"
              label="Included Services"
              options={serviceOptions}
            />
          </div>
        </FormSection>

        <FormActions cancelHref="/admin/offerings" error={error} />
      </AppForm>
    </FormScreen>
  )
}
