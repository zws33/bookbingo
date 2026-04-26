import { type ReactNode } from 'react';
import { AlertDialog as RadixAlertDialog } from 'radix-ui';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.js';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
}

export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
}: AlertDialogProps) {
  return (
    <RadixAlertDialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-40',
            'bg-black/50',
            'opacity-0 transition-opacity duration-200 data-[state=open]:opacity-100',
          )}
        />
        <RadixAlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100%-2rem)] max-w-sm',
            'z-50 bg-white rounded-lg shadow-xl p-6 focus:outline-none',
            'scale-95 opacity-0 transition-all duration-200 data-[state=open]:scale-100 data-[state=open]:opacity-100',
          )}
        >
          <RadixAlertDialog.Title className="text-lg font-semibold text-gray-900">
            {title}
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description className="mt-2 text-gray-600">
            {message}
          </RadixAlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <RadixAlertDialog.Cancel asChild>
              <Button variant="ghost">
                Cancel
              </Button>
            </RadixAlertDialog.Cancel>
            <RadixAlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
