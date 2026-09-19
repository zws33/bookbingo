import { z } from 'zod/v4';
import { createCallable } from '../lib/callable';
import { ListTBRResponseSchema, type TBREntry } from '../types/schemas';

const VoidResponseSchema = z.unknown().transform(() => undefined);

/**
 * The caller's own reading list, newest first, each entry with its book
 * resolved. There is no userId parameter — a TBR list is private, so the
 * server only ever returns the caller's.
 */
export const listMyTBR = createCallable<void, TBREntry[]>(
  'listMyTBR',
  ListTBRResponseSchema,
);

export const createTBREntry = createCallable<
  { bookId: string; plannedTiles: string[]; notes?: string },
  { tbrId: string }
>('createTBREntry', z.object({ tbrId: z.string().min(1) }));

export const updateTBREntry = createCallable<
  { tbrId: string; plannedTiles: string[]; notes?: string },
  undefined
>('updateTBREntry', VoidResponseSchema);

export const deleteTBREntry = createCallable<{ tbrId: string }, undefined>(
  'deleteTBREntry',
  VoidResponseSchema,
);

/**
 * Turns a planned entry into a reading and removes the entry, atomically.
 *
 * The new reading keeps the entry's id, so retrying after a lost response
 * returns the same reading rather than failing. The book is not a parameter:
 * the stored entry already names it.
 */
export const promoteTBREntry = createCallable<
  { tbrId: string; tiles: string[]; isFreebie: boolean },
  { readingId: string }
>('promoteTBREntry', z.object({ readingId: z.string().min(1) }));
