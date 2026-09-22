import z from 'zod/v4';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const SubmitFeedbackRequestSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH),
});

export const GitHubIssueResponseSchema = z.object({
  html_url: z.string(),
  number: z.number().int().positive(),
});
