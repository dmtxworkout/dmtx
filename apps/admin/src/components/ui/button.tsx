import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
  {
    variants: {
      variant: {
        default: 'bg-accent font-bold text-white hover:bg-accent-hover',
        outline: 'border border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
        ghost: 'text-ink-3 hover:bg-line-4',
        destructive: 'bg-accent-dark font-bold text-white hover:bg-[#851f0d]',
      },
      size: {
        default: 'h-[38px] px-4 text-sm',
        sm: 'h-8 rounded-[7px] px-3 text-[13px]',
        icon: 'h-[38px] w-[38px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
