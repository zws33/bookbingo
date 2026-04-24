import { Toast as RadixToast } from 'radix-ui';
import { cn } from '../../lib/cn.js';

export const TOAST_EXIT_DURATION_MS = 200;

export interface ToastItemProps {
  message: string;
  type: 'success' | 'error';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ToastItem({ message, type, open, onOpenChange }: ToastItemProps) {
  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={3000}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white',
        type === 'success' ? 'bg-green-500' : 'bg-red-500',
        'opacity-0 translate-y-2 transition-all duration-200',
        'data-[state=open]:opacity-100 data-[state=open]:translate-y-0',
        'data-[state=closed]:opacity-0 data-[state=closed]:translate-y-2',
      )}
    >
      <RadixToast.Title asChild>
        <span className="text-sm font-medium">{message}</span>
      </RadixToast.Title>
      <RadixToast.Close
        className="ml-auto text-white/80 hover:text-white"
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </RadixToast.Close>
    </RadixToast.Root>
  );
}

export function ToastViewport() {
  return (
    <RadixToast.Viewport
      className={cn('fixed bottom-4 right-4 z-50 flex flex-col gap-2 outline-none')}
    />
  );
}
