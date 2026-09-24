import z from 'zod/v4';
import { OptionalInstant, ServerInstant } from '../common/firestoreHelpers.js';

export const ListReadingsRequestSchema = z.object({
  userId: z.string().trim().min(1),
});

export const ReadingFieldsSchema = z.object({
  bookId: z.string().trim().min(1),
  tiles: z.array(z.string().trim().min(1)),
  isFreebie: z.boolean(),
});

export const UpdateReadingRequestSchema = ReadingFieldsSchema.extend({
  readingId: z.string().trim().min(1),
});

export const DeleteReadingRequestSchema = z.object({
  readingId: z.string().trim().min(1),
});

export const ReadingDocSchema = z.object({
  bookId: z.string().min(1),
  tiles: z.array(z.string()),
  isFreebie: z.boolean(),
  readAt: ServerInstant,
  createdAt: ServerInstant,
  updatedAt: OptionalInstant,
});
