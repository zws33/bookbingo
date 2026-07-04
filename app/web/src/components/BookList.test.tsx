import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Book, Reading } from '@bookbingo/lib-types';
import { render } from '../testing/test-utils';
import { BookList } from './BookList';

// Mock only the I/O boundary — the Firestore-backed service layer. BookList is
// otherwise props-driven (readings + booksById are passed in), so nothing else
// needs stubbing. We assert the contract each service call must satisfy.
vi.mock('../lib/books', () => ({
  getOrCreateBook: vi.fn(),
  updateReading: vi.fn(),
  deleteReading: vi.fn(),
}));

import { getOrCreateBook, updateReading, deleteReading } from '../lib/books';

const getOrCreateBookMock = vi.mocked(getOrCreateBook);
const updateReadingMock = vi.mocked(updateReading);
const deleteReadingMock = vi.mocked(deleteReading);

const BOOK: Book = {
  id: 'book-1',
  title: 'Dune',
  author: 'Frank Herbert',
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01'),
};

const READING: Reading = {
  id: 'reading-1',
  bookId: 'book-1',
  tiles: ['t02'], // "part of a series"
  isFreebie: false,
  readAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
};

function renderBookList() {
  const user = userEvent.setup();
  render(
    <BookList
      userId="user-1"
      readings={[READING]}
      booksById={new Map([[BOOK.id, BOOK]])}
      loading={false}
    />,
  );
  return { user };
}

const editDialog = () => screen.getByRole('dialog');

describe('BookList edit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrCreateBookMock.mockResolvedValue('book-1');
    updateReadingMock.mockResolvedValue(undefined);
    deleteReadingMock.mockResolvedValue(undefined);
  });

  it('opens the edit dialog with identity locked when a book is clicked', async () => {
    const { user } = renderBookList();

    await user.click(screen.getByRole('button', { name: /Dune/ }));

    const dialog = editDialog();
    // Identity is shown as static text, not as editable inputs.
    expect(within(dialog).getByText('Dune')).toBeInTheDocument();
    expect(within(dialog).getByText('Frank Herbert')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('persists tile changes via getOrCreateBook then updateReading', async () => {
    const { user } = renderBookList();

    await user.click(screen.getByRole('button', { name: /Dune/ }));
    // Add a second tile on top of the reading's existing "part of a series".
    await user.click(
      within(editDialog()).getByRole('button', { name: 'unfinished reread' }),
    );
    await user.click(
      within(editDialog()).getByRole('button', { name: /save/i }),
    );

    await waitFor(() => {
      expect(updateReadingMock).toHaveBeenCalledWith(
        'user-1',
        'reading-1',
        'book-1',
        ['t02', 't01'],
        false,
      );
    });
    expect(getOrCreateBookMock).toHaveBeenCalledWith(
      'Dune',
      'Frank Herbert',
      'user-1',
    );
  });

  it('deletes the reading after confirming in the alert dialog', async () => {
    const { user } = renderBookList();

    await user.click(screen.getByRole('button', { name: /Dune/ }));
    await user.click(
      screen.getByRole('button', { name: /delete this reading/i }),
    );
    // Confirmation is a distinct dialog with an exact "Delete" action.
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteReadingMock).toHaveBeenCalledWith('user-1', 'reading-1');
    });
  });
});
