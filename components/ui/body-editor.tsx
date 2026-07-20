'use client'

import * as React from 'react'
import { useState, useRef } from 'react'
import {
  Bold, Italic, Underline, Link2, Minus,
  Heading1, Heading2, Heading3,
  List, ListOrdered, AlignLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Available template variables
// ---------------------------------------------------------------------------
const VARIABLES = [
  { group: 'Client', vars: [
    { label: 'First name',    value: '{{client_first_name}}' },
    { label: 'Last name',     value: '{{client_last_name}}' },
    { label: 'Email',         value: '{{client_email}}' },
  ]},
  { group: 'Booking', vars: [
    { label: 'Date',          value: '{{booking_date}}' },
    { label: 'Start time',    value: '{{booking_start_time}}' },
    { label: 'End time',      value: '{{booking_end_time}}' },
    { label: 'Duration',      value: '{{booking_duration_minutes}}' },
    { label: 'Price',         value: '{{booking_price}}' },
    { label: 'Notes',         value: '{{booking_notes}}' },
  ]},
  { group: 'Offering', vars: [
    { label: 'Name',          value: '{{offering_name}}' },
    { label: 'Description',   value: '{{offering_description}}' },
  ]},
]

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------
type WrapArgs = { before: string; after: string }

function applyWrap(
  value: string,
  start: number,
  end: number,
  { before, after }: WrapArgs,
): { value: string; selStart: number; selEnd: number } {
  const selected = value.substring(start, end)
  const newValue = value.substring(0, start) + before + selected + after + value.substring(end)
  return {
    value: newValue,
    selStart: start + before.length,
    selEnd: start + before.length + selected.length,
  }
}

function applyInsert(
  value: string,
  cursor: number,
  text: string,
): { value: string; selStart: number; selEnd: number } {
  const newValue = value.substring(0, cursor) + text + value.substring(cursor)
  return { value: newValue, selStart: cursor + text.length, selEnd: cursor + text.length }
}

// ---------------------------------------------------------------------------
// ToolbarButton
// ---------------------------------------------------------------------------
function ToolbarButton({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      onClick={onClick}
      className={cn('size-7 shrink-0', active && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// BodyEditor
// ---------------------------------------------------------------------------
type Props = {
  value: string
  onChange: (v: string) => void
  minRows?: number
}

export function BodyEditor({ value, onChange, minRows = 16 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [savedSel, setSavedSel] = useState<{ start: number; end: number } | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────────

  function getSelection() {
    const ta = textareaRef.current
    if (!ta) return { start: 0, end: 0 }
    return { start: ta.selectionStart, end: ta.selectionEnd }
  }

  function applyAndRestore(
    result: { value: string; selStart: number; selEnd: number },
  ) {
    onChange(result.value)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(result.selStart, result.selEnd)
    })
  }

  function wrap(before: string, after: string) {
    const { start, end } = getSelection()
    applyAndRestore(applyWrap(value, start, end, { before, after }))
  }

  function insert(text: string) {
    const { start } = getSelection()
    applyAndRestore(applyInsert(value, start, text))
  }

  // ── link popover ─────────────────────────────────────────────────────────

  function openLinkPopover() {
    setSavedSel(getSelection())
    setLinkUrl('')
    setLinkOpen(true)
  }

  function confirmLink() {
    if (!savedSel) return
    const { start, end } = savedSel
    const label = value.substring(start, end) || 'link text'
    const result = applyWrap(value, start, end === start ? start : end, {
      before: `<a href="${linkUrl}">`,
      after: label === 'link text' && start === end ? `link text</a>` : `</a>`,
    })
    // If nothing was selected, insert a full anchor
    const finalValue = start === end
      ? applyInsert(value, start, `<a href="${linkUrl}">link text</a>`)
      : { value: result.value, selStart: result.selStart, selEnd: result.selEnd }

    applyAndRestore(typeof finalValue === 'string' ? { value: finalValue, selStart: start, selEnd: start } : finalValue)
    setLinkOpen(false)
    setSavedSel(null)
  }

  // ── toolbar definition ───────────────────────────────────────────────────

  return (
    <Tabs defaultValue="edit" className="w-full">
      <div className="flex items-center justify-between mb-2">
        <TabsList className="h-8">
          <TabsTrigger value="edit" className="text-xs px-3 h-6">Edit</TabsTrigger>
          <TabsTrigger value="preview" className="text-xs px-3 h-6">Preview</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="edit" className="mt-0 space-y-2">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/30 px-2 py-1.5">
          {/* Text formatting */}
          <ToolbarButton onClick={() => wrap('<strong>', '</strong>')} title="Bold">
            <Bold className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => wrap('<em>', '</em>')} title="Italic">
            <Italic className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => wrap('<u>', '</u>')} title="Underline">
            <Underline className="size-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Headings */}
          <ToolbarButton onClick={() => wrap('<h1>', '</h1>')} title="Heading 1">
            <Heading1 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => wrap('<h2>', '</h2>')} title="Heading 2">
            <Heading2 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => wrap('<h3>', '</h3>')} title="Heading 3">
            <Heading3 className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => wrap('<p>', '</p>')} title="Paragraph">
            <AlignLeft className="size-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => wrap('<ul>\n  <li>', '</li>\n</ul>')}
            title="Bullet list"
          >
            <List className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => wrap('<ol>\n  <li>', '</li>\n</ol>')}
            title="Numbered list"
          >
            <ListOrdered className="size-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* HR */}
          <ToolbarButton onClick={() => insert('\n<hr />\n')} title="Horizontal rule">
            <Minus className="size-3.5" />
          </ToolbarButton>

          {/* Link */}
          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Insert link"
                onClick={openLinkPopover}
                className="size-7 shrink-0"
              >
                <Link2 className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-2">
                <Label className="text-xs">URL<RequiredMark /></Label>
                <Input
                  autoFocus
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmLink()}
                  required
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={confirmLink} disabled={!linkUrl}>
                    Insert
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm resize-y"
          style={{ minHeight: `${minRows * 1.5}rem` }}
          placeholder="Write your email HTML here…"
          spellCheck={false}
        />

        {/* Variables */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Variables — click to insert at cursor, or use in any field above
          </p>
          <div className="space-y-2">
            {VARIABLES.map(({ group, vars }) => (
              <div key={group} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-14 shrink-0">{group}</span>
                {vars.map(({ label, value: varValue }) => (
                  <Badge
                    key={varValue}
                    variant="secondary"
                    className="cursor-pointer font-mono text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => insert(varValue)}
                    title={`Insert ${varValue}`}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="preview" className="mt-0">
        <div
          className="min-h-64 rounded-md border bg-white p-6 text-sm prose prose-sm max-w-none dark:bg-muted/10"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-muted-foreground italic">Nothing to preview yet.</p>' }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Variables like <code>{'{{client_first_name}}'}</code> will be replaced with real values when the email is sent.
        </p>
      </TabsContent>
    </Tabs>
  )
}
