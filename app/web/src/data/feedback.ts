import { createCallable } from '../lib/callable';
import { SubmitFeedbackResponseSchema } from '../types/schemas';

/**
 * Files a GitHub issue. The token lives in the function, never in the client.
 */
export const submitFeedback = createCallable<
  { type: 'bug' | 'feature'; title: string; description: string },
  { issueUrl: string; issueNumber: number }
>('submitFeedback', SubmitFeedbackResponseSchema);
