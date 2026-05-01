'use client'

import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// WizardScreen — outer page container for multi-step wizards
// ---------------------------------------------------------------------------
export function WizardScreen({ children }: { children: React.ReactNode }) {
  return <div className="max-w-4xl space-y-6">{children}</div>
}

// ---------------------------------------------------------------------------
// WizardStepIndicator — step progress bar
// Fully generic — accepts any number of steps, not tied to any specific wizard.
//
// Visual states:
//   completed  → filled primary circle with checkmark + primary connector line
//   current    → ring-2 ring-primary circle with step number
//   future     → muted circle with step number
// ---------------------------------------------------------------------------
type Step = { label: string }

export function WizardStepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number
  steps: Step[]
}) {
  return (
    <div className="rounded-xl border bg-card px-6 py-4">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = stepNumber < currentStep
          const isCurrent = stepNumber === currentStep

          return (
            <div key={stepNumber} className="flex flex-1 items-center last:flex-none">
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'ring-2 ring-primary bg-background text-primary'
                        : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {isCompleted ? (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </div>
                <span
                  className={[
                    'hidden text-xs font-medium sm:block',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div
                  className={[
                    'mx-2 mb-4 h-px flex-1 transition-colors',
                    isCompleted ? 'bg-primary' : 'bg-border',
                  ].join(' ')}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WizardStepFooter — back / primary-action button row
//
// Used at the bottom of every wizard step. When onBack is omitted (first step),
// only the primary action button is shown flush-right.
// ---------------------------------------------------------------------------
export function WizardStepFooter({
  onBack,
  backDisabled = false,
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
}: {
  /** Omit on the first step — hides the Back button entirely. */
  onBack?: () => void
  backDisabled?: boolean
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
}) {
  return (
    <div className={`flex ${onBack ? 'justify-between' : 'justify-end'}`}>
      {onBack && (
        <Button variant="outline" onClick={onBack} disabled={backDisabled}>
          Back
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
    </div>
  )
}
