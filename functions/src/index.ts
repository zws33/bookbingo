import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { callable } from './callable.js';
import { submitFeedbackHandler, GITHUB_API_URL } from './feedback/handler.js';
import {
  fetchBookDetailsHandler,
  searchBooksHandler,
} from './books/handler.js';
import { createManualBookHandler } from './books/manual.js';
import { bookRepository } from './books/store.js';
import { getBoardConfigHandler } from './config/handler.js';
import { userHandlers } from './users/handler.js';
import { userProfileRepository } from './users/store.js';
import { readingHandlers } from './readings/handler.js';
import { readingRepository } from './readings/store.js';
import { libraryHandlers } from './library/handler.js';
import { tbrHandlers } from './tbr/handler.js';
import { tbrEntryRepository } from './tbr/store.js';

setGlobalOptions({ region: 'northamerica-northeast1' });

const githubPat = defineSecret('GITHUB_PAT');

const usersRepo = userProfileRepository();
const tbrRepo = tbrEntryRepository();
const readingsRepo = readingRepository();
const booksRepo = bookRepository();

const users = userHandlers(usersRepo);
const tbr = tbrHandlers(tbrRepo, booksRepo);
const readings = readingHandlers(readingsRepo, usersRepo, booksRepo);
const library = libraryHandlers(readingsRepo, usersRepo, booksRepo);

export const submitFeedback = onCall(
  { invoker: 'public', secrets: [githubPat] },
  callable(
    (request) =>
      submitFeedbackHandler(request, {
        pat: githubPat.value(),
        apiUrl: GITHUB_API_URL,
      }),
    'Failed to create GitHub issue. Please try again.',
  ),
);

export const fetchBookDetails = onCall(
  { invoker: 'public' },
  callable(fetchBookDetailsHandler, 'Could not load book details.'),
);
export const searchBooks = onCall(
  { invoker: 'public' },
  callable(searchBooksHandler, 'Book search is unavailable.'),
);

export const createManualBook = onCall(
  { invoker: 'public' },
  callable(createManualBookHandler, 'Failed to create book.'),
);

export const getBoardConfig = onCall(
  { invoker: 'public' },
  callable(getBoardConfigHandler, 'Could not load the board.'),
);

export const listUsers = onCall(
  { invoker: 'public' },
  callable(users.list, 'Could not load users.'),
);
export const getUserProfile = onCall(
  { invoker: 'public' },
  callable(users.get, 'Could not load that profile.'),
);
export const syncMyProfile = onCall(
  { invoker: 'public' },
  callable(users.sync, 'Failed to save your profile.'),
);

export const listReadings = onCall(
  { invoker: 'public' },
  callable(readings.list, 'Could not load those readings.'),
);
export const getLibrary = onCall(
  { invoker: 'public' },
  callable(library.get, 'Could not load the library.'),
);
export const getLeaderboard = onCall(
  { invoker: 'public' },
  callable(readings.leaderboard, 'Could not load the leaderboard.'),
);
export const createReading = onCall(
  { invoker: 'public' },
  callable(readings.create, 'Failed to save your reading.'),
);
export const updateReading = onCall(
  { invoker: 'public' },
  callable(readings.update, 'Failed to save your reading.'),
);
export const deleteReading = onCall(
  { invoker: 'public' },
  callable(readings.remove, 'Failed to save your reading.'),
);

export const listMyTBR = onCall(
  { invoker: 'public' },
  callable(tbr.list, 'Could not load your reading list.'),
);
export const createTBREntry = onCall(
  { invoker: 'public' },
  callable(tbr.create, 'Failed to save your reading list.'),
);
export const updateTBREntry = onCall(
  { invoker: 'public' },
  callable(tbr.update, 'Failed to save your reading list.'),
);
export const deleteTBREntry = onCall(
  { invoker: 'public' },
  callable(tbr.remove, 'Failed to save your reading list.'),
);
export const promoteTBREntry = onCall(
  { invoker: 'public' },
  callable(tbr.promote, 'Failed to save your reading.'),
);
