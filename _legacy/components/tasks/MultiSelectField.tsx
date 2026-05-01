'use client'

import * as React from 'react'
import { useFormContext, Controller, type FieldValues, type Path } from 'react-hook-form'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export type SelectOption = { label: string; value: string }

type Props<T extends FieldValues> = {
  name: Path<T>
  label?: string
  placeholder?: string
  options: SelectOption[]
  required?: boolean
  span?: 'full'
}

export function MultiSelectField<T extends FieldValues>({
  name,
  label,
  placeholder = 'Select…',
  options,
  required,
  span,
}: Props<T>) {
  const { control, formState: { errors } } = useFormContext<T>()
  const error = errors[name]?.message as string | undefined
  const [open, setOpen] = React.useState(false)

  return (
    <div className={span === 'full' ? 'md:col-span-2' : undefined}>
      {label && (
        <Label className="mb-1.5 block text-sm">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const selected: string[] = Array.isArray(field.value) ? field.value : []

          function toggle(value: string) {
            const next = selected.includes(value)
              ? selected.filter((v) => v !== value)
              : [...selected, value]
            field.onChange(next)
          }

          function remove(value: string, e: React.MouseEvent) {
            e.stopPropagation()
            field.onChange(selected.filter((v) => v !== value))
          }

          const selectedOptions = options.filter((o) => selected.includes(o.value))

          return (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between h-auto min-h-9 font-normal"
                >
                  <div className="flex flex-wrap gap-1">
                    {selectedOptions.length === 0 ? (
                      <span className="text-muted-foreground">{placeholder}</span>
                    ) : (
                      selectedOptions.map((o) => (
                        <Badge
                          key={o.value}
                          variant="secondary"
                          className="flex items-center gap-1 pr-1"
                        >
                          {o.label}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => remove(o.value, e)}
                            onKeyDown={(e) => e.key === 'Enter' && remove(o.value, e as unknown as React.MouseEvent)}
                            className="rounded-full hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
                          >
                            <X className="size-3" />
                          </span>
                        </Badge>
                      ))
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command filter={(value: string, search: string) => {
                  const opt = options.find((o) => o.value === value)
                  return opt?.label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }}>
                  <CommandInput placeholder="Search…" />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup>
                      {options.map((o) => (
                        <CommandItem
                          key={o.value}
                          value={o.value}
                          onSelect={() => toggle(o.value)}
                        >
                          <Check
                            className={cn('mr-2 size-4', selected.includes(o.value) ? 'opacity-100' : 'opacity-0')}
                          />
                          {o.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )
        }}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
