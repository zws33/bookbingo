import z from 'zod/v4';
import { EMPTY_METADATA } from '@bookbingo/lib-types';
import { log } from '@bookbingo/lib-util';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

/** Structural, so no firebase type import is needed here. */
const FirestoreTimestamp = z.custom<{ toDate(): Date }>(
  (v) => typeof (v as { toDate?: unknown })?.toDate === 'function',
);

/** Required instant. null/undefined means a pending serverTimestamp() write. */
const ServerInstant = FirestoreTimestamp.nullish().transform(
  (t) => t?.toDate() ?? new Date(),
);

/** Optional instant. Output key is typed `Date | undefined`; spread it conditionally. */
const OptionalInstant = FirestoreTimestamp.nullish().transform((t) =>
  t?.toDate(),
);

/**
 * Read-time metadata: total by construction. Written out rather than derived
 * from the write contract in `functions/src/books/schema.ts`, so adding a
 * field there cannot introduce a read that throws.
 *
 * Per-field `.catch()` preserves partial data — one bad `thumbnailUrl` no
 * longer discards a good `pageCount`, where a single failing field would
 * otherwise make `mapValid` drop the whole book. toBook logs the thumbnail
 * case so those books can be found and backfilled. The object-level
 * `.default()` covers a document with no `metadata` at all, and `.catch()` on
 * top also covers a stored `null`, which `.default()` alone does not replace.
 *
 * Every fallback is a thunk. zod returns a `.catch()` value by reference and
 * only shallow-clones a `.default()` one, so a shared literal would hand the
 * same `categories` array to every recovered book and to the exported
 * EMPTY_METADATA that `createManualBook` sends as its default payload.
 */
const BookMetadataReadSchema = z
  .object({
    pageCount: z.number().int().nonnegative().nullable().catch(null),
    publishedDate: z.string().trim().max(200).nullable().catch(null),
    categories: z.array(z.string().trim().max(200)).catch(() => []),
    language: z.string().trim().max(200).nullable().catch(null),
    isbn: z.string().trim().max(200).nullable().catch(null),
    thumbnailUrl: z.url().nullable().catch(null),
  })
  .default(() => ({ ...EMPTY_METADATA, categories: [] }))
  .catch(() => ({ ...EMPTY_METADATA, categories: [] }));

export const BookDocSchema = z.object({
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataReadSchema,
  createdBy: z.string().optional(),
  createdAt: OptionalInstant,
});

export const ReadingDocSchema = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().optional(),
  bookAuthor: z.string().optional(),
  tiles: z.array(z.string()),
  isFreebie: z.boolean(),
  readAt: ServerInstant,
  createdAt: ServerInstant,
  updatedAt: OptionalInstant,
});

export const TBREntryDocSchema = z.object({
  bookId: z.string().min(1),
  plannedTiles: z.array(z.string()),
  notes: z.string().optional(),
  addedAt: ServerInstant,
  updatedAt: OptionalInstant,
});

export const UserProfileDocSchema = z.object({
  // .default() alone only fires on a missing/undefined key; .catch() on top
  // also replaces a stored `null` — the mapper it replaces used `?? 'User'`.
  name: z.string().default('User').catch('User'),
  photoURL: z.string().nullish(),
});

export const AuthUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullable(),
  photoURL: z.string().nullable(),
});

/**
 * Maps a snapshot's documents, dropping any that fail validation.
 * One malformed document must not blank an entire collection-group read.
 */
export function mapValid<T>(
  label: string,
  docs: QueryDocumentSnapshot[],
  map: (doc: QueryDocumentSnapshot) => T,
): T[] {
  const out: T[] = [];
  for (const doc of docs) {
    try {
      out.push(map(doc));
    } catch (error) {
      log.error(label, `skipped invalid document ${doc.ref.path}`, error);
    }
  }
  return out;
}
