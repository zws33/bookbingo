import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../testing/test-utils';
import { BookForm } from './BookForm';

// BookForm is presentational + local state only. It touches no Firebase and no
// hooks, and its children (TileSelector, FreebieToggle) read from framework-
// agnostic lib/core. So this whole file needs ZERO mocks — see CONVENTIONS.md.

type BookFormProps = Parameters<typeof BookForm>[0];

// Tile display names come from lib/core TILES; the form emits their ids.
const TILE = {
  reread: { id: 't01', name: 'unfinished reread' },
  series: { id: 't02', name: 'part of a series' },
  long: { id: 't03', name: '1000+ pages' },
  short: { id: 't04', name: 'under 100 pages' },
} as const;

function renderBookForm(overrides: Partial<BookFormProps> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const props: BookFormProps = {
    identityLocked: false,
    onSubmit,
    onCancel,
    isSubmitting: false,
    ...overrides,
  };
  const user = userEvent.setup();
  render(<BookForm {...props} />);
  return { user, onSubmit, onCancel };
}

const saveButton = () => screen.getByRole('button', { name: /save/i });

describe('BookForm', () => {
  describe('when identity is locked (existing book)', () => {
    const lockedDune: Partial<BookFormProps> = {
      identityLocked: true,
      initialData: {
        title: 'Dune',
        author: 'Frank Herbert',
        tiles: [],
        isFreebie: false,
      },
    };

    it('shows the title and author as static text, not editable fields', () => {
      renderBookForm(lockedDune);

      expect(screen.getByText('Dune')).toBeInTheDocument();
      expect(screen.getByText('Frank Herbert')).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
    });

    it('enables Save immediately because the identity is already valid', () => {
      renderBookForm(lockedDune);

      expect(saveButton()).toBeEnabled();
    });

    it('submits the locked identity unchanged', async () => {
      const { user, onSubmit } = renderBookForm(lockedDune);

      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Dune',
        author: 'Frank Herbert',
        tiles: [],
        isFreebie: false,
      });
    });
  });

  describe('when identity is editable (manual entry)', () => {
    it('renders empty title and author inputs', () => {
      renderBookForm({ identityLocked: false });

      expect(screen.getByLabelText('Title')).toHaveValue('');
      expect(screen.getByLabelText('Author')).toHaveValue('');
    });

    it('keeps Save disabled until both title and author are provided', async () => {
      const { user } = renderBookForm({ identityLocked: false });

      expect(saveButton()).toBeDisabled();

      await user.type(screen.getByLabelText('Title'), 'Dune');
      expect(saveButton()).toBeDisabled();

      await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
      expect(saveButton()).toBeEnabled();
    });

    it('treats a whitespace-only field as empty', async () => {
      const { user } = renderBookForm({ identityLocked: false });

      await user.type(screen.getByLabelText('Title'), '   ');
      await user.type(screen.getByLabelText('Author'), 'Frank Herbert');

      expect(saveButton()).toBeDisabled();
    });

    it('trims surrounding whitespace from the submitted title and author', async () => {
      const { user, onSubmit } = renderBookForm({ identityLocked: false });

      await user.type(screen.getByLabelText('Title'), '  Dune  ');
      await user.type(screen.getByLabelText('Author'), '  Frank Herbert  ');
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Dune',
        author: 'Frank Herbert',
        tiles: [],
        isFreebie: false,
      });
    });
  });

  describe('tiles and freebie', () => {
    it('includes selected tiles in the submitted payload', async () => {
      const { user, onSubmit } = renderBookForm({ identityLocked: false });

      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
      await user.click(screen.getByRole('button', { name: TILE.series.name }));
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ tiles: [TILE.series.id] }),
      );
    });

    it('marks the reading as a freebie when the toggle is checked', async () => {
      const { user, onSubmit } = renderBookForm({ identityLocked: false });

      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
      await user.click(screen.getByRole('checkbox', { name: /freebie/i }));
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ isFreebie: true }),
      );
    });

    it('blocks a 4th tile once three are selected (non-freebie limit)', async () => {
      const { user } = renderBookForm({ identityLocked: false });

      await user.click(screen.getByRole('button', { name: TILE.reread.name }));
      await user.click(screen.getByRole('button', { name: TILE.series.name }));
      await user.click(screen.getByRole('button', { name: TILE.long.name }));

      // The three chosen tiles stay operable (they can be deselected)...
      expect(
        screen.getByRole('button', { name: TILE.reread.name }),
      ).toBeEnabled();
      // ...but any unchosen tile is disabled at the limit.
      expect(
        screen.getByRole('button', { name: TILE.short.name }),
      ).toBeDisabled();
    });

    it('allows more than three tiles when the reading is a freebie', async () => {
      const { user, onSubmit } = renderBookForm({ identityLocked: false });

      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.type(screen.getByLabelText('Author'), 'Frank Herbert');
      await user.click(screen.getByRole('checkbox', { name: /freebie/i }));

      await user.click(screen.getByRole('button', { name: TILE.reread.name }));
      await user.click(screen.getByRole('button', { name: TILE.series.name }));
      await user.click(screen.getByRole('button', { name: TILE.long.name }));
      await user.click(screen.getByRole('button', { name: TILE.short.name }));

      // No tile is disabled in freebie mode.
      expect(
        screen.getByRole('button', { name: TILE.short.name }),
      ).toBeEnabled();

      await user.click(saveButton());
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          isFreebie: true,
          tiles: [TILE.reread.id, TILE.series.id, TILE.long.id, TILE.short.id],
        }),
      );
    });
  });

  describe('submission and cancellation', () => {
    it('shows a saving state and disables both actions while submitting', () => {
      renderBookForm({
        identityLocked: true,
        isSubmitting: true,
        initialData: {
          title: 'Dune',
          author: 'Frank Herbert',
          tiles: [],
          isFreebie: false,
        },
      });

      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('calls onCancel when Cancel is clicked', async () => {
      const { user, onCancel } = renderBookForm({ identityLocked: false });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
