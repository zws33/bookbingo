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
    // Suppress the React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(
        // Intentionally not wrapped in ToastProvider — test-utils wraps in AllProviders
        // which includes ToastProvider, so we render directly via RTL render
        <ToastTrigger />,
        { wrapper: undefined },
      );
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
    expect(screen.getByRole('alert')).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
