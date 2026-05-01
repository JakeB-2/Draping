'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  useForm,
  FormProvider,
  useFormContext,
  Controller,
  type FieldValues,
  type DefaultValues,
  type SubmitHandler,
  type Path,
  type Resolver,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type ZodType } from 'zod'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// FormScreen — full page wrapper
// ---------------------------------------------------------------------------
export function FormScreen({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl space-y-6">{children}</div>
}

// ---------------------------------------------------------------------------
// FormHeader — mirrors DetailHeader
// ---------------------------------------------------------------------------
export function FormHeader({
  backHref,
  backLabel = 'Back',
  title,
  subtitle,
}: {
  backHref: string
  backLabel?: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-0">
        <h1 className="text-lg font-medium">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FormSection — card with optional title, two-column grid
// ---------------------------------------------------------------------------
export function FormSection({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {title && (
        <>
          <div className="px-4 md:px-6 py-4">
            <h2 className="text-sm font-medium">{title}</h2>
          </div>
          <Separator />
        </>
      )}
      <div className="px-4 md:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FormActions — submit + cancel row
// ---------------------------------------------------------------------------
export function FormActions({
  cancelHref,
  onCancel,
  submitLabel = 'Save',
  error,
}: {
  /** Navigation target for Cancel. Use onCancel instead when inside a Dialog. */
  cancelHref?: string
  /** Callback for Cancel — use this inside Dialogs so the button closes the dialog. */
  onCancel?: () => void
  submitLabel?: string
  /** Server/submit error to display above the action buttons. */
  error?: string | null
}) {
  const { formState: { isSubmitting } } = useFormContext()
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : cancelHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field primitives — all read name + span from FormSection grid
// ---------------------------------------------------------------------------

type FieldWrapperProps = {
  label?: string  // omit when the section title already makes it obvious (e.g. a "Notes" section with one textarea)
  error?: string
  required?: boolean
  span?: 'full'
  children: React.ReactNode
}

function FieldWrapper({ label, error, required, span, children }: FieldWrapperProps) {
  return (
    <div className={span === 'full' ? 'md:col-span-2' : undefined}>
      {label && (
        <Label className="mb-1.5 block text-sm">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

// TextField
export function TextField<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  span,
  type = 'text',
}: {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  span?: 'full'
  type?: React.HTMLInputTypeAttribute
}) {
  const { register, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Input type={type} placeholder={placeholder} {...register(name)} />
    </FieldWrapper>
  )
}

// TextareaField
export function TextareaField<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  span,
  rows = 3,
}: {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  span?: 'full'
  rows?: number
}) {
  const { register, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Textarea placeholder={placeholder} rows={rows} {...register(name)} />
    </FieldWrapper>
  )
}

// Sentinel used internally by SelectField when allowNone is set.
// Selecting this item clears the field value back to ''.
const NONE_SENTINEL = '__none__'

// SelectField
export function SelectField<T extends FieldValues>({
  name,
  label,
  placeholder,
  options,
  required,
  span,
  allowNone,
}: {
  name: Path<T>
  label?: string
  placeholder?: string
  options: { label: string; value: string }[]
  required?: boolean
  span?: 'full'
  /** When set, prepends a "clear" option with this label (e.g. "—"). Clicking it resets the field to empty. */
  allowNone?: string
}) {
  const { control, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          // Use undefined (not '') when no value so Radix shows the placeholder,
          // not a selected-but-blank state.
          <Select
            value={field.value || undefined}
            onValueChange={(val) => field.onChange(val === NONE_SENTINEL ? '' : val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder ?? (label ? `Select ${label.toLowerCase()}` : 'Select…')} />
            </SelectTrigger>
            <SelectContent>
              {allowNone && (
                <SelectItem value={NONE_SENTINEL}>{allowNone}</SelectItem>
              )}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FieldWrapper>
  )
}

// CheckboxField — shadcn Checkbox for boolean fields
export function CheckboxField<T extends FieldValues>({
  name,
  label,
}: {
  name: Path<T>
  label?: string
}) {
  const { control } = useFormContext<T>()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center gap-2">
          <Checkbox
            id={name as string}
            checked={!!field.value}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          <Label htmlFor={name as string} className="text-sm cursor-pointer font-normal">
            {label}
          </Label>
        </div>
      )}
    />
  )
}

// DateField — shadcn Calendar + Popover
export function DateField<T extends FieldValues>({
  name,
  label,
  placeholder = 'Pick a date',
  required,
  span,
}: {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  span?: 'full'
}) {
  const { control, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                {field.value ? (
                  format(new Date(field.value), 'PPP')
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={field.value ? new Date(field.value) : undefined}
                onSelect={(date) => field.onChange(date ?? null)}
              />
            </PopoverContent>
          </Popover>
        )}
      />
    </FieldWrapper>
  )
}

// NumberField
export function NumberField<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  span,
  min,
  max,
  step,
}: {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  span?: 'full'
  min?: number
  max?: number
  step?: number | 'any'
}) {
  const { register, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Input
        type="number"
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        {...register(name, { valueAsNumber: true })}
      />
    </FieldWrapper>
  )
}

// FileField
export function FileField<T extends FieldValues>({
  name,
  label,
  accept,
  multiple,
  required,
  span,
}: {
  name: Path<T>
  label?: string
  accept?: string
  multiple?: boolean
  required?: boolean
  span?: 'full'
}) {
  const { register, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined

  return (
    <FieldWrapper label={label} error={error} required={required} span={span}>
      <Input
        type="file"
        accept={accept}
        multiple={multiple}
        className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
        {...register(name)}
      />
    </FieldWrapper>
  )
}

// ---------------------------------------------------------------------------
// AppForm — root provider; wraps everything, owns the form state
// ---------------------------------------------------------------------------
export function AppForm<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
}: {
  schema: ZodType<T>
  defaultValues: DefaultValues<T>
  onSubmit: SubmitHandler<T>
  children: React.ReactNode
}) {
  const methods = useForm<T>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as Resolver<T>,
    defaultValues,
    mode: 'onBlur',
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit as SubmitHandler<FieldValues>)} noValidate>
        {children}
      </form>
    </FormProvider>
  )
}

// ---------------------------------------------------------------------------
// Re-export hook so pages can read isSubmitting without importing react-hook-form
// ---------------------------------------------------------------------------
export { useFormContext }
