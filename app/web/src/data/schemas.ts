import z from 'zod/v4';
import { BookMetadataSchema, BookProviderSchema } from '@bookbingo/lib-types';
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
 * A provider's native id. Reads both the current plain-string shape and the
 * legacy `{ key, enrichedAt }` record, so documents written before `enrichedAt`
 * was dropped still parse instead of being skipped by `mapValid`. Collapse to
 * `z.string().min(1)` once no legacy documents remain.
 */
const ExternalKey = z.union([
  z.string().min(1),
  z.object({ key: z.string().min(1) }).transform((ref) => ref.key),
]);

/**
 * Read-time thumbnailUrl. Write paths enforce `z.url()`, but legacy documents
 * written before that check landed can hold an empty string or another
 * non-URL value. Coerce those to null instead of failing the whole document's
 * parse (mapValid would otherwise drop the entire book) — toBook logs which
 * books this affects so they can be backfilled.
 */
const ReadThumbnailUrl = z
  .string()
  .nullable()
  .transform((value) =>
    value !== null && z.url().safeParse(value).success ? value : null,
  );

const BookMetadataReadSchema = BookMetadataSchema.extend({
  thumbnailUrl: ReadThumbnailUrl,
});

export const BookDocSchema = z.object({
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataReadSchema.optional(),
  externalIds: z.partialRecord(BookProviderSchema, ExternalKey).optional(),
  createdBy: z.string().min(1).optional(),
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
