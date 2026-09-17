import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { submitFeedbackHandler, GITHUB_API_URL } from './feedback/handler.js';
import {
  fetchBookDetailsHandler,
  searchBooksHandler,
} from './books/handler.js';
import { createManualBookHandler } from './books/manual.js';

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
