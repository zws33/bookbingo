import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../testing/test-utils';
import { Dialog } from './Dialog.js';

describe('Dialog', () => {
  it('does not render when closed', () => {
    render(
      <Dialog isOpen={false} onClose={vi.fn()} title="Test">
        <div>Content</div>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with title when open', () => {
    render(
      <Dialog isOpen={true} onClose={vi.fn()} title="Test Title">
        <div>Content</div>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog isOpen={true} onClose={onClose} title="Test">
        <div>Content</div>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog isOpen={true} onClose={onClose} title="Test">
        <div>Content</div>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
