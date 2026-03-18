import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`h-11 w-full rounded-brand-md border px-3.5 font-body text-sm text-text transition-all duration-150 ease-in-out placeholder:text-muted disabled:bg-background disabled:cursor-not-allowed focus:outline-none focus:ring-[3px] focus:ring-[#BFDBFE] focus:ring-offset-0 ${
          error
            ? 'border-error focus:border-error'
            : 'border-border focus:border-primary'
        } ${className}`}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
export default Input
