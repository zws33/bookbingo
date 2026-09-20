import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../testing/test-utils';
import { makeReading, TILE } from '../testing/fixtures';
import { BookList } from './BookList';

// Mock only the I/O seams: the reading writes, and the two hooks that fetch
// through callables. BookList is otherwise props-driven (readings are passed
// in), so nothing else needs stubbing. We assert the contract each call must
// satisfy.
vi.mock('../data/readings', () => ({
  updateReading: vi.fn(),
  deleteReading: vi.fn(),
}));

vi.mock('../hooks/useTileCatalog', async () => ({
  useTileCatalog: (await import('../testing/fixtures')).tileCatalogStub,
}));

import { updateReading, deleteReading } from '../data/readings';

const updateReadingMock = vi.mocked(updateReading);
const deleteReadingMock = vi.mocked(deleteReading);

// Readings arrive with their book already joined, so the list needs no book
// lookup of its own.
const READING = makeReading({
  bookTitle: 'Dune',
  bookAuthor: 'Frank Herbert',
  tiles: [TILE.series.id],
});

function renderBookList() {
  const user = userEvent.setup();
  render(<BookList userId="user-1" readings={[READING]} loading={false} />);
  return { user };
}

const editDialog = () => screen.getByRole('dialog');

describe('BookList edit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateReadingMock.mockResolvedValue(undefined);
    deleteReadingMock.mockResolvedValue(undefined);
  });

  it('opens the edit dialog with identity locked when a book is clicked', async () => {
    const { user } = renderBookList();

    await user.click(await screen.findByRole('button', { name: /Dune/ }));

    const dialog = editDialog();
    // Identity is shown as static text, not as editable inputs.
    expect(within(dialog).getByText('Dune')).toBeInTheDocument();
    expect(within(dialog).getByText('Frank Herbert')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it("persists tile changes via updateReading, using the reading's existing bookId", async () => {
    const { user } = renderBookList();

    await user.click(await screen.findByRole('button', { name: /Dune/ }));
    // Add a second tile on top of the reading's existing "part of a series".
    await user.click(
      within(editDialog()).getByRole('button', { name: 'unfinished reread' }),
    );
    await user.click(
      within(editDialog()).getByRole('button', { name: /save/i }),
    );

    await waitFor(() => {
      expect(updateReadingMock).toHaveBeenCalledWith({
        readingId: 'reading-1',
        bookId: 'book-1',
        tiles: [TILE.series.id, TILE.reread.id],
        isFreebie: false,
      });
    });
  });

  it('deletes the reading after confirming in the alert dialog', async () => {
    const { user } = renderBookList();

    await user.click(await screen.findByRole('button', { name: /Dune/ }));
    await user.click(
      screen.getByRole('button', { name: /delete this reading/i }),
    );
    // Confirmation is a distinct dialog with an exact "Delete" action.
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteReadingMock).toHaveBeenCalledWith({
        readingId: 'reading-1',
      });
    });
  });
});

describe('BookList view modes', () => {
  it('marks a freebie in both card and list view', async () => {
    const user = userEvent.setup();
    render(
      <BookList
        userId="user-1"
        readings={[makeReading({ bookTitle: 'Dune', isFreebie: true })]}
        loading={false}
      />,
    );

    expect(screen.getByTitle('Freebie')).toBeInTheDocument();

    await user.click(screen.getByLabelText('List view'));

    expect(screen.getByTitle('Freebie')).toBeInTheDocument();
  });
});
