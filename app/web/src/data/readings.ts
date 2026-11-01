import { createCallable } from '../lib/callable';
import { ListReadingsResponseSchema, type Reading } from '../types/schemas';
import { z } from 'zod/v4';

const VoidResponseSchema = z.unknown().transform(() => undefined);

/**
 * One member's readings in a challenge, newest first, each with its book
 * already resolved. The score comes from `getScore`, not from here.
 */
export const listReadings = createCallable<
  { challengeId: string; userId: string },
  { readings: Reading[] }
>('listReadingsV2', ListReadingsResponseSchema);

/**
 * Writes take no userId: the server uses the caller's token, so a reading is
 * written as the caller's unless their role lets them edit another member's.
 */
export const createReading = createCallable<
  {
    challengeId: string;
    bookId: string;
    tagIds: string[];
    isFreebie: boolean;
  },
  { readingId: string }
>('createReadingV2', z.object({ readingId: z.string().min(1) }));

export const updateReading = createCallable<
  {
    challengeId: string;
    readingId: string;
    bookId: string;
    tagIds: string[];
    isFreebie: boolean;
  },
  undefined
>('updateReadingV2', VoidResponseSchema);

export const deleteReading = createCallable<
  { challengeId: string; readingId: string },
  undefined
>('deleteReadingV2', VoidResponseSchema);
