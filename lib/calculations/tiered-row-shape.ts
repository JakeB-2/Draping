// TYPE-SAFE-003: pure guard logic for TieredRowList/TieredRow
// (components/screens/row-list.tsx). `columns` and `cells` are both
// runtime-configurable props with no type-level link between them — a caller
// that adds/removes/reorders a column without updating every row's `cells`
// array in lockstep would otherwise silently shift every subsequent cell into
// the wrong desktop column / phone slot with no compile error and no runtime
// signal. This is the dev-mode check that closes that gap.
//
// Pulled out of row-list.tsx (a 'use client' file with a large Radix/UI
// dependency tree) so it's testable as plain logic, mirroring the
// lib/calculations/booking-assignment-ui.ts precedent for UI-adjacent pure
// helpers.

export function tieredRowShapeWarning(
  columnCount: number,
  cellCount: number,
  // `unknown` (not React.Key) so callers can pass a React `key`/row id
  // straight through without importing React types here — React 19's Key
  // union includes an experimental branded-symbol member that isn't meant to
  // be referenced outside React's own types.
  rowKey?: unknown,
): string | null {
  if (cellCount === columnCount) return null
  return `TieredRowList: row${rowKey != null ? ` "${String(rowKey)}"` : ''} passed ${cellCount} cell(s) but columns declares ${columnCount} — cells must be declared in the SAME order and length as columns, or content silently shifts into the wrong desktop column / phone slot.`
}
