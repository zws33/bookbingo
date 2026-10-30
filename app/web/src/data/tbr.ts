import { z } from 'zod/v4';
import { createCallable } from '../lib/callable';
import { ListTBRResponseSchema, type TBREntry } from '../types/schemas';

const VoidResponseSchema = z.unknown().transform(() => undefined);

/**
 * The caller's own reading list for a challenge, newest first, each entry with
 * its book resolved. There is no userId parameter — a reading list is private,
 * so the server only ever returns the caller's.
 */
export const listMyTBR = createCallable<{ challengeId: string }, TBREntry[]>(
  'listMyTBRV2',
  ListTBRResponseSchema,
);

export const createTBREntry = createCallable<
  {
    challengeId: string;
    bookId: string;
    plannedTagIds: string[];
    notes?: string;
  },
  { tbrId: string }
>('createTBREntryV2', z.object({ tbrId: z.string().min(1) }));

export const updateTBREntry = createCallable<
  {
    challengeId: string;
    tbrId: string;
    plannedTagIds: string[];
    notes?: string;
  },
  undefined
>('updateTBREntryV2', VoidResponseSchema);

export const deleteTBREntry = createCallable<
  { challengeId: string; tbrId: string },
  undefined
>('deleteTBREntryV2', VoidResponseSchema);

/**
 * Turns a planned entry into a reading and removes the entry, atomically.
 *
 * The new reading keeps the entry's id, so retrying after a lost response
 * returns the same reading rather than failing. The book is not a parameter:
 * the stored entry already names it.
 */
export const promoteTBREntry = createCallable<
  {
    challengeId: string;
    tbrId: string;
    tagIds: string[];
    isFreebie: boolean;
  },
  { readingId: string }
>('promoteTBREntryV2', z.object({ readingId: z.string().min(1) }));
