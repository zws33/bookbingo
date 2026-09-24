import z from 'zod/v4';
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
