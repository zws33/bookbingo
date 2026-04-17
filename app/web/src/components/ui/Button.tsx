import { type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost: 'text-gray-700 hover:text-gray-900',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed',
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn('px-4 py-2 rounded-lg', variantClasses[variant], className)}
      {...props}
    />
  );
}
