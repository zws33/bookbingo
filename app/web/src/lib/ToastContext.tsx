import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Toast as RadixToast } from 'radix-ui';
import { ToastItem, ToastViewport, TOAST_EXIT_DURATION_MS } from '../components/ui/Toast.js';

interface ToastQueueItem {
  id: string;
  message: string;
  type: 'success' | 'error';
  open: boolean;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastQueueItem[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = String(++nextId);
    setToasts((prev) => [...prev, { id, message, type, open: true }]);
  }, []);

  const showSuccess = useCallback(
    (message: string) => addToast(message, 'success'),
    [addToast],
  );

  const showError = useCallback(
    (message: string) => addToast(message, 'error'),
    [addToast],
  );

  const handleOpenChange = useCallback((id: string, open: boolean) => {
    if (!open) {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        TOAST_EXIT_DURATION_MS,
      );
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            message={toast.message}
            type={toast.type}
            open={toast.open}
            onOpenChange={(open) => handleOpenChange(toast.id, open)}
          />
        ))}
        <ToastViewport />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
