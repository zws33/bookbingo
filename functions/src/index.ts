import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { submitFeedbackHandler, GITHUB_API_URL } from './feedback/handler.js';
import {
  fetchBookDetailsHandler,
  searchBooksHandler,
} from './books/handler.js';
import { createManualBookHandler } from './books/manual.js';
import { getBooksHandler } from './books/catalog.js';
import { getBoardConfigHandler } from './config/handler.js';
import {
  getUserProfileHandler,
  listUsersHandler,
  syncMyProfileHandler,
} from './users/handler.js';
import {
  createReadingHandler,
  deleteReadingHandler,
  getLeaderboardHandler,
  listAllReadingsHandler,
  listReadingsHandler,
  updateReadingHandler,
} from './readings/handler.js';

// Colocated with Firestore (firebase.json sets the database to
// northamerica-northeast1). The default, us-central1, puts a cross-region hop
// on every document read a callable makes. The client must ask for the same
// region — see FUNCTIONS_REGION in app/web/src/lib/firebase.ts.
setGlobalOptions({ region: 'northamerica-northeast1' });

const githubPat = defineSecret('GITHUB_PAT');

export const submitFeedback = onCall(
  { invoker: 'public', secrets: [githubPat] },
  (request) =>
    submitFeedbackHandler(request, {
      pat: githubPat.value(),
      apiUrl: GITHUB_API_URL,
    }),
);

export const fetchBookDetails = onCall(
  { invoker: 'public' },
  fetchBookDetailsHandler,
);
export const searchBooks = onCall({ invoker: 'public' }, searchBooksHandler);

export const createManualBook = onCall(
  { invoker: 'public' },
  createManualBookHandler,
);

export const getBoardConfig = onCall(
  { invoker: 'public' },
  getBoardConfigHandler,
);
export const getBooks = onCall({ invoker: 'public' }, getBooksHandler);

export const listUsers = onCall({ invoker: 'public' }, listUsersHandler);
export const getUserProfile = onCall(
  { invoker: 'public' },
  getUserProfileHandler,
);
export const syncMyProfile = onCall(
  { invoker: 'public' },
  syncMyProfileHandler,
);

export const listReadings = onCall({ invoker: 'public' }, listReadingsHandler);
export const listAllReadings = onCall(
  { invoker: 'public' },
  listAllReadingsHandler,
);
export const getLeaderboard = onCall(
  { invoker: 'public' },
  getLeaderboardHandler,
);
export const createReading = onCall(
  { invoker: 'public' },
  createReadingHandler,
);
export const updateReading = onCall(
  { invoker: 'public' },
  updateReadingHandler,
);
export const deleteReading = onCall(
  { invoker: 'public' },
  deleteReadingHandler,
);
