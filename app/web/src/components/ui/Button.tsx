import { type ComponentPropsWithRef } from 'react';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.js';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:opacity-50 disabled:cursor-not-allowed',
  ghost: 'text-on-surface-variant hover:text-on-surface',
  danger:
    'bg-error text-on-error hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed',
  outline:
    'border border-outline text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-50 disabled:cursor-not-allowed',
};

/**
 * The same classes for an element that has to be an anchor — a `Link` that
 * navigates, where a button with an onClick would lose middle-click and
 * open-in-new-tab.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  className?: string,
): string {
  return cn(
    'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
    variantClasses[variant],
    className,
  );
}

export function Button({
  variant = 'primary',
  loading,
  className,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </button>
  );
}
