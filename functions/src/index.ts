import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { submitFeedbackHandler, GITHUB_API_URL } from './feedback/handler.js';
import { enrichBookHandler } from './books/handler.js';
import { createManualBookHandler } from './books/manual.js';

const githubPat = defineSecret('GITHUB_PAT');

export const submitFeedback = onCall(
  { invoker: 'public', secrets: [githubPat] },
  (request) =>
    submitFeedbackHandler(request, {
      pat: githubPat.value(),
      apiUrl: GITHUB_API_URL,
    }),
);

export const enrichBook = onCall({ invoker: 'public' }, enrichBookHandler);

export const createManualBook = onCall(
  { invoker: 'public' },
  createManualBookHandler,
);
