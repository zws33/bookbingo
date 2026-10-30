import { createCallable } from '../lib/callable';
import { GetLibraryResponseSchema, type LibraryBook } from '../types/schemas';

/**
 * Every book read in the challenge, with its readers and their tags, sorted by
 * title. The grouping is the server's work — this is a render list.
 */
export const getLibrary = createCallable<
  { challengeId: string },
  LibraryBook[]
>('getLibraryV2', GetLibraryResponseSchema);
