import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'outline' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
  outline:
    'border border-border bg-transparent text-text hover:bg-background focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
  danger:
    'bg-error text-white hover:bg-red-700 focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center h-11 px-5 rounded-brand-md font-body font-bold text-[15px] transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
