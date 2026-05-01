'use client'

import { useState, useRef } from 'react'
import { Upload, Download, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { WizardStepIndicator } from '@/components/screens/wizard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CsvColumnDef = {
  /** Matches CSV header (case-insensitive). */
  key: string
  /** Human-readable column name shown in the instructions table. */
  label: string
  required: boolean
  /** Formatting hint shown to the user, e.g. "YYYY-MM-DD" or "male / female". */
  description?: string
}

type ParsedRow<T> = {
  /** 1-based row number for display. */
  index: number
  raw: Record<string, string>
  data: T | null
  errors: string[]
  valid: boolean
}

export type CsvImportSheetProps<T> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Displayed in the description and summary — e.g. "Clients", "Materials". */
  entityName: string
  columns: CsvColumnDef[]
  /** Filename for the downloaded template CSV (default: "template.csv"). */
  templateFilename?: string
  /**
   * Validate and transform one raw CSV row into a typed record.
   * Called for every data row after parsing.
   */
  parseRow: (
    raw: Record<string, string>
  ) => { success: true; data: T } | { success: false; errors: string[] }
  /**
   * Persist the valid rows. Called only after the user confirms.
   * Should inject audit fields (created_by_user_id etc.) internally — not from CSV.
   */
  onImport: (validRows: T[]) => Promise<void>
  /** Called after a successful import (e.g. to refresh server data). */
  onSuccess?: () => void
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let i = 0
  while (i <= line.length) {
    if (i === line.length) {
      // trailing comma produces an empty field
      if (result.length > 0) break
      result.push('')
      break
    }
    if (line[i] === '"') {
      let field = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++
          break
        } else {
          field += line[i++]
        }
      }
      result.push(field)
      if (line[i] === ',') i++
    } else {
      const end = line.indexOf(',', i)
      if (end === -1) {
        result.push(line.slice(i))
        break
      }
      result.push(line.slice(i, end))
      i = end + 1
    }
  }
  return result
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')

  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(
      headers.map((h, idx) => [h, (values[idx] ?? '').trim()])
    )
  })
}

function downloadTemplate(columns: CsvColumnDef[], filename: string) {
  const headers = columns.map((c) => c.key).join(',')
  const blob = new Blob([headers + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// preprocessCsvRow — converts raw CSV strings to typed values before safeParse
//
// Every CSV field is a string. This helper:
//   - Converts empty strings to `undefined` (for optional schema fields)
//   - Coerces listed keys to boolean ("true"/"false" → true/false)
//   - Coerces listed keys to float or integer
//   - Coerces listed keys to Date (for z.date() fields)
// ---------------------------------------------------------------------------

export function preprocessCsvRow(
  raw: Record<string, string>,
  {
    booleans = [],
    floats = [],
    integers = [],
    dates = [],
  }: {
    booleans?: string[]
    floats?: string[]
    integers?: string[]
    dates?: string[]
  } = {}
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => {
      if (v === '') return [k, undefined]
      if (booleans.includes(k)) return [k, v.toLowerCase() === 'true']
      if (floats.includes(k)) return [k, parseFloat(v)]
      if (integers.includes(k)) return [k, parseInt(v, 10)]
      if (dates.includes(k)) return [k, new Date(v)]
      return [k, v]
    })
  )
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Instructions' },
  { label: 'Upload' },
  { label: 'Preview' },
  { label: 'Confirm' },
  { label: 'Result' },
]

// ---------------------------------------------------------------------------
// CsvImportSheet
// ---------------------------------------------------------------------------

export function CsvImportSheet<T>({
  open,
  onOpenChange,
  entityName,
  columns,
  templateFilename = 'template.csv',
  parseRow,
  onImport,
  onSuccess,
}: CsvImportSheetProps<T>) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow<T>[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    error?: string
  } | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())

  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep(1)
    setFile(null)
    setParsedRows([])
    setImporting(false)
    setImportResult(null)
    setExpandedErrors(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset()
    onOpenChange(value)
  }

  async function handleParseFile() {
    if (!file) return
    const text = await file.text()
    const rawRows = parseCsv(text)
    const rows: ParsedRow<T>[] = rawRows.map((raw, i) => {
      const result = parseRow(raw)
      if (result.success) {
        return { index: i + 1, raw, data: result.data, errors: [], valid: true }
      }
      return { index: i + 1, raw, data: null, errors: result.errors, valid: false }
    })
    setParsedRows(rows)
    setStep(3)
  }

  async function handleImport() {
    const validData = parsedRows.filter((r) => r.valid).map((r) => r.data!)
    setImporting(true)
    try {
      await onImport(validData)
      setImportResult({ imported: validData.length })
      onSuccess?.()
    } catch (e) {
      setImportResult({
        imported: 0,
        error: e instanceof Error ? e.message : 'Import failed. Please try again.',
      })
    } finally {
      setImporting(false)
      setStep(5)
    }
  }

  function toggleError(index: number) {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const validRows = parsedRows.filter((r) => r.valid)
  const invalidRows = parsedRows.filter((r) => !r.valid)
  // Show up to 4 column keys in the preview table
  const previewCols = columns.slice(0, 4)

  // ---------------------------------------------------------------------------
  // Footer buttons per step
  // ---------------------------------------------------------------------------
  function renderFooter() {
    if (step === 1) {
      return (
        <div className="flex justify-end">
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )
    }
    if (step === 2) {
      return (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button onClick={handleParseFile} disabled={!file}>
            <Upload className="size-4" />
            Parse File
          </Button>
        </div>
      )
    }
    if (step === 3) {
      return (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(2)}>
            Back
          </Button>
          <Button onClick={() => setStep(4)} disabled={validRows.length === 0}>
            Continue
          </Button>
        </div>
      )
    }
    if (step === 4) {
      return (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(3)} disabled={importing}>
            Back
          </Button>
          <Button onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : `Import ${validRows.length} Row${validRows.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )
    }
    // step 5
    return (
      <div className="flex justify-between">
        <Button variant="outline" onClick={reset}>
          Import More
        </Button>
        <Button onClick={() => handleOpenChange(false)}>Close</Button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step content
  // ---------------------------------------------------------------------------
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-hidden sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Import CSV</SheetTitle>
          <SheetDescription>
            Upload a CSV file to import {entityName.toLowerCase()} in bulk.
          </SheetDescription>
        </SheetHeader>

        <div className="shrink-0 px-4">
          <WizardStepIndicator currentStep={step} steps={STEPS} />
        </div>

        {/* Scrollable step content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 space-y-4">
          {/* ── Step 1: Instructions ── */}
          {step === 1 && (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>File Requirements</CardTitle>
                  <CardDescription>
                    The first row must contain column headers exactly as listed
                    below (case-insensitive).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Column</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Format / Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((col) => (
                        <TableRow key={col.key}>
                          <TableCell className="font-mono text-xs">
                            {col.key}
                          </TableCell>
                          <TableCell>
                            {col.required ? (
                              <Badge variant="default">Required</Badge>
                            ) : (
                              <Badge variant="outline">Optional</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {col.description ?? col.label}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Alert>
                <AlertTitle>Tips</AlertTitle>
                <AlertDescription>
                  Save your file as UTF-8 encoded CSV. Leave optional cells
                  blank rather than using placeholder text. Dates must match the
                  exact format shown above.
                </AlertDescription>
              </Alert>

              <Button
                variant="outline"
                onClick={() => downloadTemplate(columns, templateFilename)}
              >
                <Download className="size-4" />
                Download Template
              </Button>
            </>
          )}

          {/* ── Step 2: Upload ── */}
          {step === 2 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Select File</CardTitle>
                <CardDescription>
                  Choose a CSV file from your computer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="csv-upload">CSV File</Label>
                  <Input
                    id="csv-upload"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                {file && (
                  <p className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{file.name}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Preview & Validation ── */}
          {step === 3 && (
            <>
              <Alert
                variant={invalidRows.length > 0 ? 'destructive' : 'default'}
              >
                <AlertTitle>
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} found
                </AlertTitle>
                <AlertDescription>
                  {validRows.length} valid
                  {invalidRows.length > 0 && ` · ${invalidRows.length} invalid`}
                </AlertDescription>
              </Alert>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {previewCols.map((col) => (
                        <TableHead key={col.key}>{col.label}</TableHead>
                      ))}
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => (
                      <TableRow key={row.index}>
                        <TableCell className="text-muted-foreground text-xs">
                          {row.index}
                        </TableCell>
                        {previewCols.map((col) => (
                          <TableCell
                            key={col.key}
                            className="max-w-[12rem] truncate text-xs"
                          >
                            {row.raw[col.key.toLowerCase()] ?? ''}
                          </TableCell>
                        ))}
                        <TableCell>
                          {row.valid ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="size-3" />
                              Valid
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="size-3" />
                              Invalid
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Collapsible error list per invalid row */}
              {invalidRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Validation errors</p>
                  {invalidRows.map((row) => {
                    const expanded = expandedErrors.has(row.index)
                    return (
                      <div
                        key={row.index}
                        className="rounded-lg border bg-card overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleError(row.index)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors"
                        >
                          <span>
                            <span className="font-medium">Row {row.index}</span>
                            <span className="ml-2 text-muted-foreground">
                              {row.errors.length} error{row.errors.length !== 1 ? 's' : ''}
                            </span>
                          </span>
                          {expanded ? (
                            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                        {expanded && (
                          <ul className="border-t px-4 py-3 space-y-1">
                            {row.errors.map((err, i) => (
                              <li
                                key={i}
                                className="text-sm text-destructive flex gap-2"
                              >
                                <span className="mt-0.5 shrink-0">·</span>
                                {err}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {validRows.length === 0 && (
                <Alert variant="destructive">
                  <AlertTitle>No valid rows</AlertTitle>
                  <AlertDescription>
                    Fix the errors in your file and re-upload to proceed.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* ── Step 4: Confirm ── */}
          {step === 4 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Ready to Import</CardTitle>
                <CardDescription>
                  Review the summary below before importing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                  <CheckCircle2 className="size-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} will be imported
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entityName} will be created with your account as the owner.
                    </p>
                  </div>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                    <XCircle className="size-5 text-destructive shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      {invalidRows.length} invalid row{invalidRows.length !== 1 ? 's' : ''} will be skipped.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 5: Result ── */}
          {step === 5 && importResult && (
            <>
              {importResult.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Import failed</AlertTitle>
                  <AlertDescription>{importResult.error}</AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>Import complete</AlertTitle>
                  <AlertDescription>
                    Successfully imported {importResult.imported} {entityName.toLowerCase()}.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-4 pt-4 pb-4">
          {renderFooter()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
