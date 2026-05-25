import { httpsCallable } from 'firebase/functions';
import type { BookMetadata } from '@bookbingo/lib-types';
import { functions } from './firebase';

export interface BookSearchResult {
  externalId: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
  publishedDate: string | null;
}

export interface BookEnrichmentResult {
  externalId: string;
  title: string;
  author: string;
  metadata: BookMetadata;
}

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
