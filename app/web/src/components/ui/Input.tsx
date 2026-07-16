import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        'w-full px-3 py-2 border rounded-lg bg-surface-container-lowest text-on-surface placeholder-on-surface-variant',
        'focus:outline-none focus:ring-2 focus:border-transparent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error ? 'border-error focus:ring-error' : 'border-outline focus:ring-primary',
        className,
      )}
      {...props}
    />
  );
});
