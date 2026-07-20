export function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true"> *</span>
      <span className="sr-only"> (required)</span>
    </>
  )
}
