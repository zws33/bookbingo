import { z } from 'zod/v4';
import { OptionalInstant } from '../common/firestoreHelpers.js';

const normalizeSearchQuery = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, ' ').trim();

export const BookSearchQuerySchema = z.object({
  q: z
    .string({
      error: 'Search query must be a string.',
    })
    .transform(normalizeSearchQuery)
    .pipe(
      z
        .string()
        .min(1, 'Enter a title, author, or ISBN.')
        .max(200, 'Search queries must be 200 characters or fewer.'),
    ),
});

export type BookSearchQuery = z.infer<typeof BookSearchQuerySchema>;

export const GetBookDetailsRequestSchema = z.object({
  externalId: z.string().trim().min(1),
});

export type GetBookDetailsRequest = z.infer<typeof GetBookDetailsRequestSchema>;

export const BookMetadataSchema = z.object({
  pageCount: z.number().int().nonnegative().nullable(),
  publishedDate: z.string().trim().max(200).nullable(),
  categories: z.array(z.string().trim().max(200)),
  language: z.string().trim().max(200).nullable(),
  isbn: z.string().trim().max(200).nullable(),
  thumbnailUrl: z.url().nullable(),
});
export const CreateManualBookRequestSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  metadata: BookMetadataSchema,
});

/*
 * Read-time schemas for stored book documents.
 *
 * The read shape is restated rather than derived from the write schemas above:
 * deriving it would turn every existing document into a read that throws the
 * moment a new write field is added.
 *
 * `emptyMetadata` is written out rather than importing `EMPTY_METADATA` from
 * `@bookbingo/lib-types`: a runtime import of a workspace package fails in the
 * deployed function (see deploy-manifest.test.ts).
 */

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
