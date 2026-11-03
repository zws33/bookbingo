import z from 'zod/v4';
import { ChallengeRef } from '../challenges/schema.js';

const ReadingTags = z.array(z.string().trim().min(1));

export const ListChallengeReadingsRequestSchema = ChallengeRef.extend({
  userId: z.string().trim().min(1),
});

export const GetLeaderboardRequestSchema = ChallengeRef;

export const CreateChallengeReadingRequestSchema = ChallengeRef.extend({
  bookId: z.string().trim().min(1),
  tagIds: ReadingTags,
  isFreebie: z.boolean(),
});

export const UpdateChallengeReadingRequestSchema =
  CreateChallengeReadingRequestSchema.extend({
    readingId: z.string().trim().min(1),
  });

export const DeleteChallengeReadingRequestSchema = ChallengeRef.extend({
  readingId: z.string().trim().min(1),
});
