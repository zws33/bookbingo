import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast } from '../components/Toast';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showSuccess = useCallback((message: string) => {
    setToast({ message, type: 'success' });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const showError = useCallback((message: string) => {
    setToast({ message, type: 'error' });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleClose = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      {toast && <Toast message={toast.message} type={toast.type} onClose={handleClose} />}
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
