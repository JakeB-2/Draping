// Trimmed vendored copy of protec-portal's lib/calculations/currency.ts
// (2026-07-24 component port). Only the pieces the ported table cells need —
// protec's FX/rounding/functional-currency machinery is app-specific and was
// deliberately left behind. Kept at the same module path so the vendored
// components/tables/table-cells.tsx imports verbatim.

/** Default BCP-47 locale for the money formatter. */
export const DEFAULT_LOCALE = 'en-US' as const

/** Format a money amount with its currency folded in (e.g. "$1,234.00"). */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}
