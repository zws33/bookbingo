import { type LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn('block text-sm font-medium text-gray-700', className)}
      {...props}
    />
  );
}
