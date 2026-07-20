const DEFAULT_TIME_ZONE = 'America/Toronto'

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  const existing = partsFormatters.get(timeZone)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  partsFormatters.set(timeZone, formatter)
  return formatter
}

function partsAt(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

export function safeTimeZone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const p = partsAt(date, safeTimeZone(timeZone))
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function timeKeyInTimeZone(date: Date, timeZone: string): string {
  const p = partsAt(date, safeTimeZone(timeZone))
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export function zonedDateTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  const zone = safeTimeZone(timeZone)
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)

  const firstParts = partsAt(new Date(wallClockAsUtc), zone)
  const firstOffset = Date.UTC(
    firstParts.year,
    firstParts.month - 1,
    firstParts.day,
    firstParts.hour,
    firstParts.minute,
    firstParts.second,
  ) - wallClockAsUtc

  let result = wallClockAsUtc - firstOffset
  const secondParts = partsAt(new Date(result), zone)
  const secondOffset = Date.UTC(
    secondParts.year,
    secondParts.month - 1,
    secondParts.day,
    secondParts.hour,
    secondParts.minute,
    secondParts.second,
  ) - result

  if (secondOffset !== firstOffset) result = wallClockAsUtc - secondOffset
  return new Date(result)
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`)
  const end = Date.parse(`${to}T12:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

export function weekdayForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay()
}

export function mondayForDateKey(dateKey: string): string {
  const weekday = weekdayForDateKey(dateKey)
  return addDaysToDateKey(dateKey, -(weekday === 0 ? 6 : weekday - 1))
}

export function formatInTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...options,
    timeZone: safeTimeZone(timeZone),
  }).format(new Date(iso))
}
