import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { render } from '../testing/test-utils';
import { ToastProvider, useToast } from './ToastContext';

// Helper component that calls useToast and exposes actions via buttons
function ToastTrigger() {
  const { showSuccess, showError } = useToast();
  return (
    <>
      <button onClick={() => showSuccess('Book logged!')}>success</button>
      <button onClick={() => showError('Something went wrong')}>error</button>
    </>
  );
}

describe('ToastContext', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('useToast throws when used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<ToastTrigger />, { wrapper: undefined });
    }).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });

  it('showSuccess renders a success toast', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'success' }).click();
    });
    expect(screen.getByText('Book logged!')).toBeInTheDocument();
  });

  it('showError renders an error toast', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'error' }).click();
    });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('toast auto-dismisses after 3 seconds', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'success' }).click();
    });
    expect(screen.getByText('Book logged!')).toBeInTheDocument();

    // Advance past Radix duration (3000ms) + exit animation cleanup (200ms)
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(screen.queryByText('Book logged!')).not.toBeInTheDocument();
  });

  it('multiple toasts can be shown simultaneously', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'success' }).click();
      screen.getByRole('button', { name: 'error' }).click();
    });
    expect(screen.getByText('Book logged!')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
