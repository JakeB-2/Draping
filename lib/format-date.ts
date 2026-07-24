// SSR-safe, manual-parse date formatter — NO date-fns dependency.
//
// All functions here parse only the raw string or use Intl/local-getter
// arithmetic, so output is identical on the server and the client with no
// hydration mismatch. This is the right home for:
//   - Table column accessors and server-rendered date cells.
//   - Timezone-aware "today" helpers (todayInTimeZone).
//   - DATE-column write helpers (formatLocalDate).
//
// If you need calendar-UI labels that can rely on date-fns (e.g. month
// names from the locale, range formatting), use lib/format/segment-date.ts
// instead.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Format an ISO date string (e.g. "2024-01-15" or "2024-01-15T10:00:00Z") as
 * "Jan 15" — month first, no leading zero, NO YEAR. This is the app-wide house
 * convention (owner decision, 2026-07-08) for row/list/card/subtitle date
 * displays. Parses only the date portion so output is timezone-independent and
 * identical on server and client — safe for use in SSR'd table column accessors.
 *
 * Where the year is genuinely needed — key-value detail Field rows, audit/legal
 * timestamps, period ranges that span years — use `formatFullDate` instead.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const datePart = iso.slice(0, 10)
  const parts = datePart.split('-')
  if (parts.length !== 3) return '—'
  const [, month, day] = parts
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return '—'
  return `${MONTHS[m - 1]} ${d}`
}

/**
 * `formatDate` plus a compact two-digit year ONLY when the date falls outside
 * the current calendar year: "Jul 9" this year, "Jul 9 '25" otherwise (owner
 * decision 2026-07-09, via R-UX-039's per-surface year-back mechanism). Used
 * by the table DateCell so financial-doc Date columns stay unambiguous across
 * years without paying the year tax on every current-year row. `currentYear`
 * is injectable for tests.
 */
export function formatTableDate(
  iso: string | null | undefined,
  currentYear: number = new Date().getFullYear(),
): string {
  const base = formatDate(iso)
  if (base === '—' || !iso) return base
  const year = parseInt(iso.slice(0, 4), 10)
  if (!Number.isFinite(year) || year === currentYear) return base
  return `${base} '${String(year % 100).padStart(2, '0')}`
}

/**
 * Format an ISO date string as "Jan 15, 2024" — month-first with the year,
 * for key-value detail contexts (Field/SectionStack rows, detail-pane
 * timestamps, audit/legal-ish dates) where the year is genuinely needed.
 * Row/list/card surfaces should use `formatDate` (no year) instead.
 */
export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const datePart = iso.slice(0, 10)
  const parts = datePart.split('-')
  if (parts.length !== 3) return '—'
  const [year, month, day] = parts
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return '—'
  return `${MONTHS[m - 1]} ${d}, ${year}`
}

/**
 * "Jan 1, 2026 – Dec 31, 2026 · USD" — the detail-header subtitle for
 * period-scoped catalogs (price lists, pay lists). Keeps the year because
 * these ranges can span years. Either date may be '' (period missing); the
 * currency segment drops when empty too.
 */
export function formatPeriodSubtitle(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  currency?: string | null,
): string {
  const range = startIso && endIso ? `${formatFullDate(startIso)} – ${formatFullDate(endIso)}` : ''
  return [range, currency ?? ''].filter(Boolean).join(' · ')
}

/**
 * Format a JS Date as the local calendar date (`YYYY-MM-DD`) for `DATE`
 * column writes.
 *
 * Why NOT `date.toISOString().slice(0, 10)`: `toISOString` converts to UTC
 * before formatting, so a Date picked at midnight local time in any
 * negative-offset timezone (Mexico City is UTC-6/UTC-7) renders as the
 * PREVIOUS day's ISO date. The acc-doc schema's `transactionDateSchema`
 * already uses the local-getters pattern below; this is the shared helper
 * for every other date-only writer (staff hired_on, pay periods, time
 * periods, pay-list ranges, price-list effective dates, etc.).
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Today's calendar date (`YYYY-MM-DD`) in a specific IANA timezone.
 *
 * Use when "what day is it" must follow the business timezone, not the server
 * clock — on Vercel the server runs in UTC, so an evening request west of UTC
 * (Mexico City is UTC-6/UTC-7) would otherwise resolve "today"/"tomorrow" to
 * the wrong calendar day (M11/OPS-002). `en-CA` formats natively as YYYY-MM-DD.
 * `now` is injectable so the UTC-midnight boundary is unit-testable.
 */
export function todayInTimeZone(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Parse a DATE-column value (`YYYY-MM-DD`) as local midnight. Native
 * `new Date('YYYY-MM-DD')` treats the value as UTC, which shifts the rendered
 * day west of UTC.
 */
export function parseDateOnlyLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function parseDateForCalendar(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  return parseDateOnlyLocal(value) ?? new Date(value)
}
