import { type ReactNode } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { cn } from '../../lib/cn.js';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  contentClassName,
}: DialogProps) {
  return (
    <RadixDialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-40',
            'bg-black/50',
            'opacity-0 transition-opacity duration-200 data-[state=open]:opacity-100',
          )}
        />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100%-2rem)] max-w-md',
            'z-50 bg-white rounded-lg shadow-xl overflow-hidden focus:outline-none',
            'scale-95 opacity-0 transition-all duration-200 data-[state=open]:scale-100 data-[state=open]:opacity-100',
            contentClassName,
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <RadixDialog.Title className="text-lg font-semibold text-gray-900">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </RadixDialog.Close>
          </div>
          <div className="p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
