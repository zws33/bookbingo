import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import z from 'zod/v4';

export const GITHUB_API_URL =
  'https://api.github.com/repos/zws33/bookbingo/issues';
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

const SubmitFeedbackRequestSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH),
});

const GitHubIssueResponseSchema = z.object({
  html_url: z.string(),
  number: z.number().int().positive(),
});

export interface FeedbackDeps {
  pat: string;
  apiUrl: string;
}

export async function submitFeedbackHandler(
  request: CallableRequest<unknown>,
  deps: FeedbackDeps,
): Promise<{ issueUrl: string; issueNumber: number }> {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Must be signed in to submit feedback.',
    );
  }

  const parsed = SubmitFeedbackRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
  }
  const { type, title, description } = parsed.data;

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
