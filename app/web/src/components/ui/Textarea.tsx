import { type ComponentPropsWithRef } from 'react';
import { cn } from '../../lib/cn.js';

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
        'disabled:opacity-50 disabled:cursor-not-allowed resize-none',
        className,
      )}
      {...props}
    />
  );
}
