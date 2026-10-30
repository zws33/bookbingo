import z from 'zod/v4';
import { ChallengeRef } from '../challenges/schema.js';

export const GetScoreRequestSchema = ChallengeRef.extend({
  userId: z.string().trim().min(1),
});
