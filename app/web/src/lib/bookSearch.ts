import { httpsCallable } from 'firebase/functions';
import type {
  BookSearchResult,
  BookEnrichmentResult,
} from '@bookbingo/lib-types';
import {
  SearchBooksResponseSchema,
  BookEnrichmentResultSchema,
} from '@bookbingo/lib-types';
import { functions } from './firebase';

export type { BookSearchResult, BookEnrichmentResult };

const enrichBook = httpsCallable(functions, 'enrichBook');

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const result = await enrichBook({ action: 'search', query });
  return SearchBooksResponseSchema.parse(result.data);
}

export async function lookupBook(
  externalId: string,
): Promise<BookEnrichmentResult> {
  const result = await enrichBook({ action: 'lookup', externalId });
  return BookEnrichmentResultSchema.parse(result.data);
}
