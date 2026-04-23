import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../testing/test-utils';
import { FeedbackModal } from './FeedbackModal';

// Mock Firebase functions so tests don't make real network calls
vi.mock('../lib/firebase', () => ({
  functions: {},
}));

// vi.hoisted ensures mockHttpsCallable is initialized before the module-level
// httpsCallable(functions, 'submitFeedback') call in FeedbackModal.tsx runs.
const mockHttpsCallable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallable,
}));

function fillForm(title: string, description: string) {
  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText(/steps to reproduce|description/i), {
    target: { value: description },
  });
}

describe('FeedbackModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<FeedbackModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the modal when open', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Feedback')).toBeInTheDocument();
  });

  it('shows Bug Report and Feature Request radio options', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />);
    expect(
      screen.getByRole('radio', { name: /bug report/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /feature request/i }),
    ).toBeInTheDocument();
  });

  it('defaults to Bug Report type', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />);
    expect(screen.getByRole('radio', { name: /bug report/i })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /feature request/i }),
    ).not.toBeChecked();
  });

  it('disables Submit button when title or description is empty', () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('enables Submit button when title and description are filled', async () => {
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await act(async () => {
      fillForm('Something broke', 'Click the button');
    });

    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('calls submitFeedback with correct data on submit', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: { issueUrl: 'https://github.com/...', issueNumber: 1 },
    });
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await act(async () => {
      fillForm('Something broke', 'Click the button');
    });
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockHttpsCallable).toHaveBeenCalledWith({
        type: 'bug',
        title: 'Something broke',
        description: 'Click the button',
      });
    });
  });

  it('calls onClose after successful submission', async () => {
    mockHttpsCallable.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await act(async () => {
      fillForm('A title', 'A description');
    });
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows an error toast and stays open on submission failure', async () => {
    mockHttpsCallable.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await act(async () => {
      fillForm('A title', 'A description');
    });
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert', { hidden: true });
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/failed to submit feedback/i);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('switches label to "Description" when Feature Request is selected', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole('radio', { name: /feature request/i }));

    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets form state when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<FeedbackModal isOpen={true} onClose={onClose} />);

    await act(async () => {
      fillForm('Some title', 'Some description');
    });
    expect(screen.getByLabelText(/title/i)).toHaveValue('Some title');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // State is reset before onClose() is called, so fields are empty
    // (modal stays visible in tests because onClose is a mock)
    expect(screen.getByLabelText(/title/i)).toHaveValue('');
    expect(screen.getByLabelText(/steps to reproduce/i)).toHaveValue('');
  });
});
