import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { submitFeedbackHandler, GITHUB_API_URL } from './handler.js';

initializeApp();

const githubPat = defineSecret('GITHUB_PAT');

// TODO: Add rate limiting to prevent authenticated users from spamming GitHub Issues
export const submitFeedback = onCall(
  { secrets: [githubPat] },
  (request) => submitFeedbackHandler(request, { pat: githubPat.value(), apiUrl: GITHUB_API_URL }),
);
