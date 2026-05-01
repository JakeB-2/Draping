'use client'

import * as React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { useFormContext } from 'react-hook-form'
import { Clock } from 'lucide-react'
import { WizardScreen, WizardStepIndicator, WizardStepFooter } from '@/components/screens/wizard'
import {
  FormSection, AppForm,
  TextField, TextareaField, NumberField, CheckboxField,
} from '@/components/screens/form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableRow,
} from '@/components/ui/table'
import { createOffering } from '@/lib/actions/offerings'

type Service = {
  id: string
  name: string
  time_requirement_minutes: number
  service_group_id: string
}

type ServiceGroup = {
  id: string
  name: string
  services: Service[]
}

export type Props = {
  serviceGroups: ServiceGroup[]
  breakThresholdMinutes: number
  defaultBreakDurationMinutes: number
}

const WIZARD_STEPS = [
  { label: 'Select Services' },
  { label: 'Details' },
]

const detailsSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  duration_minutes: z.number().min(1, 'Must be at least 1 minute'),
  price_amount: z.number().min(0, 'Must be 0 or more'),
  pair_allowed: z.boolean(),
  is_active: z.boolean(),
})
type DetailsSchema = z.infer<typeof detailsSchema>

// Captures current form values before navigating back so they survive the remount.
function DetailsFormActions({
  onBack,
  error,
}: {
  onBack: (saved: DetailsSchema) => void
  error: string | null
}) {
  const { formState: { isSubmitting }, getValues } = useFormContext<DetailsSchema>()
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between">
        <Button variant="outline" type="button" onClick={() => onBack(getValues())}>
          Back
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Create Offering'}
        </Button>
      </div>
    </div>
  )
}

// Read-only services breakdown shown on step 2 for reference.
function ServicesSummaryCard({
  selectedServices,
  serviceTimeTotal,
  includesBreak,
  breakDuration,
  totalDuration,
  breakThresholdMinutes,
}: {
  selectedServices: Service[]
  serviceTimeTotal: number
  includesBreak: boolean
  breakDuration: number
  totalDuration: number
  breakThresholdMinutes: number
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          Selected Services
          <Badge variant="outline" className="font-normal text-xs">
            <Clock className="size-3 mr-1" />
            {totalDuration} min calculated
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableBody>
            {selectedServices.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="py-2 text-sm">{s.name}</TableCell>
                <TableCell className="py-2 text-right text-sm text-muted-foreground">
                  {s.time_requirement_minutes} min
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium bg-muted/30">
              <TableCell className="py-2 text-sm">Services total</TableCell>
              <TableCell className="py-2 text-right text-sm">{serviceTimeTotal} min</TableCell>
            </TableRow>
            {includesBreak && (
              <>
                <TableRow>
                  <TableCell className="py-2 text-sm text-muted-foreground pl-8">
                    Break
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm text-muted-foreground">
                    +{breakDuration} min
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell className="py-2 text-sm">Total</TableCell>
                  <TableCell className="py-2 text-right text-sm">{totalDuration} min</TableCell>
                </TableRow>
              </>
            )}
            {!includesBreak && serviceTimeTotal > breakThresholdMinutes && (
              <TableRow>
                <TableCell colSpan={2} className="py-2 text-xs text-muted-foreground">
                  No break added (threshold {breakThresholdMinutes} min) — go back to add one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t">
          <p className="text-xs text-muted-foreground">
            The duration field below is pre-filled from this total. Override it if needed.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function NewOfferingWizard({
  serviceGroups,
  breakThresholdMinutes,
  defaultBreakDurationMinutes,
}: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [includesBreak, setIncludesBreak] = useState(false)
  const [breakDuration, setBreakDuration] = useState(defaultBreakDurationMinutes)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Preserved so form values survive Back → Forward navigation
  const [savedDetails, setSavedDetails] = useState<Partial<DetailsSchema>>({})

  const allServices = serviceGroups.flatMap((g) => g.services)
  const selectedServices = allServices.filter((s) => selectedIds.has(s.id))
  const serviceTimeTotal = selectedServices.reduce((sum, s) => sum + s.time_requirement_minutes, 0)
  const exceedsThreshold = serviceTimeTotal > breakThresholdMinutes
  const totalDuration = serviceTimeTotal + (includesBreak ? breakDuration : 0)

  function toggleService(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBack(values: DetailsSchema) {
    setSavedDetails(values)
    setStep(1)
  }

  async function handleDetailsSubmit(data: DetailsSchema) {
    setSubmitError(null)
    const err = await createOffering({
      ...data,
      break_required: includesBreak,
      service_ids: Array.from(selectedIds),
    })
    if (err) { setSubmitError(err); return }
    router.push('/admin/offerings')
  }

  // ── Step 1: service selection ─────────────────────────────────────────────

  if (step === 1) {
    return (
      <WizardScreen>
        <WizardStepIndicator currentStep={1} steps={WIZARD_STEPS} />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Included Services</CardTitle>
          </CardHeader>
          <CardContent>
            {serviceGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No service groups found. Create service groups and services first.
              </p>
            ) : (
              <div
                className="grid gap-6"
                style={{ gridTemplateColumns: `repeat(${Math.min(serviceGroups.length, 4)}, minmax(0, 1fr))` }}
              >
                {serviceGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-2">
                    <div className="pb-2 border-b">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.name}
                      </h3>
                    </div>
                    {group.services.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No services</p>
                    ) : (
                      group.services.map((service) => {
                        const isSelected = selectedIds.has(service.id)
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => toggleService(service.id)}
                            className={[
                              'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors w-full',
                              isSelected
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/50',
                            ].join(' ')}
                          >
                            <span className="text-sm font-medium leading-tight">{service.name}</span>
                            <Badge variant="secondary" className="w-fit gap-1 text-xs font-normal">
                              <Clock className="size-3" />
                              {service.time_requirement_minutes} min
                            </Badge>
                          </button>
                        )
                      })
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedServices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Time Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableBody>
                  {selectedServices.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.time_requirement_minutes} min
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium bg-muted/30">
                    <TableCell>Services total</TableCell>
                    <TableCell className="text-right">{serviceTimeTotal} min</TableCell>
                  </TableRow>
                  {exceedsThreshold && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="includes-break"
                              checked={includesBreak}
                              onCheckedChange={(v) => setIncludesBreak(v === true)}
                            />
                            <Label htmlFor="includes-break" className="text-sm cursor-pointer font-normal">
                              Add a break
                              <span className="ml-1 text-xs text-muted-foreground">
                                (total exceeds {breakThresholdMinutes} min threshold)
                              </span>
                            </Label>
                          </div>
                          {includesBreak && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                value={breakDuration}
                                onChange={(e) => setBreakDuration(Math.max(1, Number(e.target.value)))}
                                className="w-20 h-8 text-sm"
                              />
                              <span className="text-sm text-muted-foreground whitespace-nowrap">min</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {includesBreak && (
                    <>
                      <TableRow>
                        <TableCell className="text-muted-foreground pl-8">Break</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          +{breakDuration} min
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{totalDuration} min</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <WizardStepFooter
          onNext={() => setStep(2)}
          nextDisabled={selectedIds.size === 0}
          nextLabel="Continue to Details"
        />
      </WizardScreen>
    )
  }

  // ── Step 2: offering details ──────────────────────────────────────────────

  return (
    <WizardScreen>
      <WizardStepIndicator currentStep={2} steps={WIZARD_STEPS} />

      <ServicesSummaryCard
        selectedServices={selectedServices}
        serviceTimeTotal={serviceTimeTotal}
        includesBreak={includesBreak}
        breakDuration={breakDuration}
        totalDuration={totalDuration}
        breakThresholdMinutes={breakThresholdMinutes}
      />

      <Separator />

      <AppForm
        schema={detailsSchema}
        defaultValues={{
          name: savedDetails.name ?? '',
          description: savedDetails.description ?? '',
          duration_minutes: savedDetails.duration_minutes ?? (totalDuration || 60),
          price_amount: savedDetails.price_amount ?? 0,
          pair_allowed: savedDetails.pair_allowed ?? false,
          is_active: savedDetails.is_active ?? true,
        }}
        onSubmit={handleDetailsSubmit}
      >
        <FormSection title="Details">
          <TextField<DetailsSchema> name="name" label="Name" required />
          <TextareaField<DetailsSchema> name="description" label="Description" span="full" rows={2} />
        </FormSection>

        <FormSection title="Pricing & Duration">
          <NumberField<DetailsSchema>
            name="duration_minutes"
            label="Total Duration (minutes)"
            required
            min={1}
          />
          <NumberField<DetailsSchema>
            name="price_amount"
            label="Price ($)"
            required
            min={0}
            step={0.01}
          />
        </FormSection>

        <FormSection title="Options">
          <div className="flex flex-col gap-3 md:col-span-2">
            <CheckboxField<DetailsSchema> name="pair_allowed" label="Can be booked as a pair (2 clients)" />
            <CheckboxField<DetailsSchema> name="is_active" label="Active (bookable by clients)" />
          </div>
        </FormSection>

        <DetailsFormActions onBack={handleBack} error={submitError} />
      </AppForm>
    </WizardScreen>
  )
}
