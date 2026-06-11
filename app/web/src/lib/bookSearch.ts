import { httpsCallable } from 'firebase/functions';
import type { BookSearchResult, BookEnrichmentResult } from '@bookbingo/lib-types';
import { functions } from './firebase';

export type { BookSearchResult, BookEnrichmentResult };

const enrichBook = httpsCallable(functions, 'enrichBook');

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const result = await enrichBook({ action: 'search', query });
  return result.data as BookSearchResult[];
}

export async function lookupBook(
  externalId: string,
): Promise<BookEnrichmentResult> {
  const result = await enrichBook({ action: 'lookup', externalId });
  return result.data as BookEnrichmentResult;
}
