'use client'

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3
  variant: 'labeled' | 'numbered' | 'bar'
}

const stepLabels = ['Welcome', 'Connect', 'Upload']
const stepSubtitles = ['Introduction to Docket tools', 'Sync your accounting software', 'Your first invoice analysis']

export default function StepIndicator({ currentStep, variant }: StepIndicatorProps) {
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full ${
              step <= currentStep ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>
    )
  }

  if (variant === 'numbered') {
    return (
      <div className="flex items-center justify-center gap-8">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`font-body text-xs tracking-widest uppercase ${
              step === currentStep
                ? 'text-primary font-bold border-b-2 border-primary pb-1'
                : 'text-muted'
            }`}
          >
            Step {String(step).padStart(2, '0')}
          </span>
        ))}
      </div>
    )
  }

  // variant === 'labeled'
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((step, i) => (
        <div
          key={step}
          className={`flex items-center gap-3 rounded-brand-md px-4 py-3 ${
            step === currentStep
              ? 'bg-surface shadow-soft border border-border'
              : ''
          }`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step === currentStep
                ? 'bg-primary text-white'
                : 'bg-background text-muted'
            }`}
          >
            {step}
          </span>
          <div>
            <p className={`text-sm font-bold ${step === currentStep ? 'text-text' : 'text-muted'}`}>
              {stepLabels[i]}
            </p>
            <p className={`text-xs ${step === currentStep ? 'text-muted' : 'text-muted/60'}`}>
              {stepSubtitles[i]}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
