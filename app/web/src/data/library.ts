import { createCallable } from '../lib/callable';
import { GetLibraryResponseSchema, type LibraryBook } from '../types/schemas';

/**
 * Every book anyone has read, with its readers and their tiles, sorted by
 * title. The grouping is the server's work — this is a render list.
 */
export const getLibrary = createCallable<void, LibraryBook[]>(
  'getLibrary',
  GetLibraryResponseSchema,
);
