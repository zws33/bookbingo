import z from 'zod/v4';
import { ChallengeRef } from '../challenges/schema.js';

const NotesSchema = z.string().trim().max(2000).optional();

const PlannedTags = z.array(z.string().trim().min(1));

export const ListChallengeTBRRequestSchema = ChallengeRef;

export const CreateChallengeTBRRequestSchema = ChallengeRef.extend({
  bookId: z.string().trim().min(1),
  plannedTagIds: PlannedTags,
  notes: NotesSchema,
});

export const UpdateChallengeTBRRequestSchema = ChallengeRef.extend({
  tbrId: z.string().trim().min(1),
  plannedTagIds: PlannedTags,
  notes: NotesSchema,
});

export const DeleteChallengeTBRRequestSchema = ChallengeRef.extend({
  tbrId: z.string().trim().min(1),
});

/** No bookId: the entry already names its book, and that is the one promoted. */
export const PromoteChallengeTBRRequestSchema = ChallengeRef.extend({
  tbrId: z.string().trim().min(1),
  tagIds: z.array(z.string().trim().min(1)),
  isFreebie: z.boolean(),
});
