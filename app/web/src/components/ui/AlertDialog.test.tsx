import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../testing/test-utils';
import { AlertDialog } from './AlertDialog.js';

describe('AlertDialog', () => {
  it('does not render when closed', () => {
    render(
      <AlertDialog
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete"
        message="Are you sure?"
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    render(
      <AlertDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Book"
        message="This cannot be undone."
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Book')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm when action button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <AlertDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Delete"
        message="Sure?"
        confirmLabel="Delete"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AlertDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete"
        message="Sure?"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AlertDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete"
        message="Sure?"
      />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses custom confirmLabel', () => {
    render(
      <AlertDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Remove"
        message="Sure?"
        confirmLabel="Yes, remove"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Yes, remove' }),
    ).toBeInTheDocument();
  });
});
