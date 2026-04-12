import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../testing/test-utils';
import { Modal } from './Modal';

describe('Modal', () => {
  it('focuses the modal content only when isOpen becomes true', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <input data-testid="test-input" />
      </Modal>
    );

    const modalElement = screen.getByRole('dialog');
    expect(document.activeElement).toBe(modalElement);

    // Manually move focus to the input field
    const input = screen.getByTestId('test-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    // Re-render with a NEW onClose identity, but same isOpen
    rerender(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <input data-testid="test-input" />
      </Modal>
    );

    // FOCUS SHOULD NOT HAVE MOVED BACK TO MODAL
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(modalElement);
  });

  it('sets up escape key listener', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <div>Content</div>
      </Modal>
    );

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(onClose).toHaveBeenCalled();
  });
});
