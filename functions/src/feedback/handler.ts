import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { parseRequest, requireAuth } from '../callable.js';
import {
  GitHubIssueResponseSchema,
  SubmitFeedbackRequestSchema,
} from './schema.js';

export const GITHUB_API_URL =
  'https://api.github.com/repos/zws33/bookbingo/issues';

export interface FeedbackDeps {
  pat: string;
  apiUrl: string;
}

export async function submitFeedbackHandler(
  request: CallableRequest<unknown>,
  deps: FeedbackDeps,
): Promise<{ issueUrl: string; issueNumber: number }> {
  requireAuth(request, 'submit feedback');
  const { type, title, description } = parseRequest(
    SubmitFeedbackRequestSchema,
    request.data,
  );

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
      title,
      body: description,
      labels: ['user-feedback', label],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('GitHub API error', {
      status: response.status,
      body: errorBody,
    });
    throw new HttpsError(
      'internal',
      'Failed to create GitHub issue. Please try again.',
    );
  }

  const issue = GitHubIssueResponseSchema.parse(await response.json());
  return { issueUrl: issue.html_url, issueNumber: issue.number };
}
