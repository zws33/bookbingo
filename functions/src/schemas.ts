import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import z from 'zod/v4';
import { logWarning } from './observability.js';

/**
 * Read-time schemas for stored documents.
 *
 * Copied from `app/web/src/data/schemas.ts`, which keeps serving the client
 * until it stops reading Firestore directly (steps 5–8 of
 * docs/functions-data-migration-plan.md) and is deleted in step 9. Two
 * differences from that file, both forced by the environment:
 *
 * - `EMPTY_METADATA` is written out here. On the client it comes from
 *   `@bookbingo/lib-types`, which functions cannot import at runtime.
 * - Bad documents are reported through Cloud Logging rather than `log` from
 *   `@bookbingo/lib-util`, for the same reason.
 *
 * The write contract stays separate, in books/schema.ts. Restating the read
 * shape rather than deriving it from the write shape is what stops a new
 * write field from turning every existing document into a read that throws.
 */

/** Structural, so both admin and client Timestamps satisfy it. */
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
 * Every fallback is a thunk. zod returns a `.catch()` value by reference and
 * only shallow-clones a `.default()` one, so a shared literal would hand the
 * same `categories` array to every recovered book.
 */
const emptyMetadata = () => ({
  pageCount: null,
  publishedDate: null,
  categories: [] as string[],
  language: null,
  isbn: null,
  thumbnailUrl: null,
});

/**
 * Total by construction. Per-field `.catch()` preserves partial data — one bad
 * `thumbnailUrl` (a legacy empty string, most commonly) must not discard a good
 * `pageCount`, where a single failing field would otherwise make `mapValid`
 * drop the whole book. The object-level `.default()` covers a document with no
 * `metadata` at all, and `.catch()` on top also covers a stored `null`, which
 * `.default()` alone does not replace.
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
  .default(emptyMetadata)
  .catch(emptyMetadata);

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
  // also replaces a stored `null`.
  name: z.string().default('User').catch('User'),
  photoURL: z.string().nullish(),
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
      logWarning('document.invalid', error, { label, path: doc.ref.path });
    }
  }
  return out;
}
