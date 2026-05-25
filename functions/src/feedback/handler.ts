import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

export const GITHUB_API_URL = 'https://api.github.com/repos/zws33/bookbingo/issues';
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

type FeedbackType = 'bug' | 'feature';

interface SubmitFeedbackData {
  type: FeedbackType;
  title: string;
  description: string;
}

export interface FeedbackDeps {
  pat: string;
  apiUrl: string;
}

export async function submitFeedbackHandler(
  request: CallableRequest<unknown>,
  deps: FeedbackDeps,
): Promise<{ issueUrl: string; issueNumber: number }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in to submit feedback.');
  }

  const data = request.data as SubmitFeedbackData;
  const { type, title, description } = data;

  if (!type || (type !== 'bug' && type !== 'feature')) {
    throw new HttpsError('invalid-argument', 'type must be "bug" or "feature".');
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'title is required.');
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `title must be at most ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'description is required.');
  }
  if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }

  const label = type === 'bug' ? 'bug' : 'enhancement';

  const response = await fetch(deps.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.pat}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: title.trim(),
      body: description.trim(),
      labels: ['user-feedback', label],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('GitHub API error', { status: response.status, body: errorBody });
    throw new HttpsError('internal', 'Failed to create GitHub issue. Please try again.');
  }

  const { html_url: issueUrl, number: issueNumber } = (await response.json()) as {
    html_url: string;
    number: number;
  };
  return { issueUrl, issueNumber };
}
