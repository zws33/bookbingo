import z from 'zod/v4';
import { ChallengeRef } from '../challenges/schema.js';
import { OptionalInstant, ServerInstant } from '../common/firestoreHelpers.js';

const NotesSchema = z.string().trim().max(2000).optional();

export const CreateTBRRequestSchema = z.object({
  bookId: z.string().trim().min(1),
  plannedTiles: z.array(z.string().trim().min(1)),
  notes: NotesSchema,
});

export const UpdateTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
  plannedTiles: z.array(z.string().trim().min(1)),
  notes: NotesSchema,
});

export const DeleteTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
});

/** No bookId: the entry already names its book, and that is the one promoted. */
export const PromoteTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
  tiles: z.array(z.string().trim().min(1)),
  isFreebie: z.boolean(),
});

export const TBREntryDocSchema = z.object({
  bookId: z.string().min(1),
  plannedTiles: z.array(z.string()),
  notes: z.string().optional(),
  addedAt: ServerInstant,
  updatedAt: OptionalInstant,
});

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
