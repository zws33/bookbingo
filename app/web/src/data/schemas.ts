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

const ExternalRefSchema = z.object({
  key: z.string().min(1),
  enrichedAt: ServerInstant,
});

export const BookDocSchema = z.object({
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataSchema.optional(),
  externalIds: z
    .partialRecord(BookProviderSchema, ExternalRefSchema)
    .optional(),
  createdBy: z.string().min(1),
  createdAt: ServerInstant,
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
