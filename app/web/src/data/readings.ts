import { createCallable } from '../lib/callable';
import {
  ListReadingsResponseSchema,
  type Reading,
  type Score,
} from '../types/schemas';
import { z } from 'zod/v4';

const VoidResponseSchema = z.unknown().transform(() => undefined);

/**
 * One user's readings, newest first, with their score.
 *
 * Readings arrive with their book resolved, and the score is computed from the
 * same set, so the two cannot disagree on screen.
 */
export const listReadings = createCallable<
  { userId: string },
  { readings: Reading[]; score: Score }
>('listReadings', ListReadingsResponseSchema);

/**
 * Writes take no userId: the server uses the caller's token, so a reading can
 * only ever be written to the caller's own collection.
 */
export const createReading = createCallable<
  { bookId: string; tiles: string[]; isFreebie: boolean },
  { readingId: string }
>('createReading', z.object({ readingId: z.string().min(1) }));

export const updateReading = createCallable<
  {
    readingId: string;
    bookId: string;
    tiles: string[];
    isFreebie: boolean;
  },
  undefined
>('updateReading', VoidResponseSchema);

export const deleteReading = createCallable<{ readingId: string }, undefined>(
  'deleteReading',
  VoidResponseSchema,
);
