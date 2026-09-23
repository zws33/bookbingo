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
import { getBoardConfigHandler } from './config/handler.js';
import { userHandlers } from './users/handler.js';
import { userProfileRepository } from './users/store.js';
import {
  createReadingHandler,
  deleteReadingHandler,
  getLeaderboardHandler,
  listReadingsHandler,
  updateReadingHandler,
} from './readings/handler.js';
import { getLibraryHandler } from './library/handler.js';
import {
  createTBREntryHandler,
  deleteTBREntryHandler,
  listMyTBRHandler,
  promoteTBREntryHandler,
  updateTBREntryHandler,
} from './tbr/handler.js';

// Colocated with Firestore (firebase.json sets the database to
// northamerica-northeast1). The default, us-central1, puts a cross-region hop
// on every document read a callable makes. The client must ask for the same
// region — see FUNCTIONS_REGION in app/web/src/lib/firebase.ts.
setGlobalOptions({ region: 'northamerica-northeast1' });

const githubPat = defineSecret('GITHUB_PAT');

const usersRepo = userProfileRepository();
const users = userHandlers(usersRepo);

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
  callable(listReadingsHandler, 'Could not load those readings.'),
);
export const getLibrary = onCall(
  { invoker: 'public' },
  callable(getLibraryHandler, 'Could not load the library.'),
);
export const getLeaderboard = onCall(
  { invoker: 'public' },
  callable(getLeaderboardHandler, 'Could not load the leaderboard.'),
);
export const createReading = onCall(
  { invoker: 'public' },
  callable(createReadingHandler, 'Failed to save your reading.'),
);
export const updateReading = onCall(
  { invoker: 'public' },
  callable(updateReadingHandler, 'Failed to save your reading.'),
);
export const deleteReading = onCall(
  { invoker: 'public' },
  callable(deleteReadingHandler, 'Failed to save your reading.'),
);

export const listMyTBR = onCall(
  { invoker: 'public' },
  callable(listMyTBRHandler, 'Could not load your reading list.'),
);
export const createTBREntry = onCall(
  { invoker: 'public' },
  callable(createTBREntryHandler, 'Failed to save your reading list.'),
);
export const updateTBREntry = onCall(
  { invoker: 'public' },
  callable(updateTBREntryHandler, 'Failed to save your reading list.'),
);
export const deleteTBREntry = onCall(
  { invoker: 'public' },
  callable(deleteTBREntryHandler, 'Failed to save your reading list.'),
);
export const promoteTBREntry = onCall(
  { invoker: 'public' },
  callable(promoteTBREntryHandler, 'Failed to save your reading.'),
);
