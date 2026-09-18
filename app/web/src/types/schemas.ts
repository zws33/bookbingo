import z from 'zod/v4';

export const BookSearchResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  thumbnailUrl: z.url().nullable().catch(null),
  publishedDate: z.string().nullable().catch(null),
});
export type BookSearchResult = z.infer<typeof BookSearchResultSchema>;

export const SearchBooksResponseSchema = z.array(BookSearchResultSchema);

export const BookDetailsResultSchema = z.object({
  bookId: z.string().min(1),
  title: z.string(),
  author: z.string(),
});

export const CreateManualBookResponseSchema = z.object({
  bookId: z.string().min(1),
});

export const SubmitFeedbackResponseSchema = z.object({
  issueUrl: z.string(),
  issueNumber: z.number().int().positive(),
});

export const TileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const BoardConfigResponseSchema = z.object({
  tiles: z.array(TileSchema),
  maxTilesPerBook: z.number().int().positive(),
});

/**
 * Metadata as the API returns it: total, every field nullable. The per-field
 * `.catch()` mirrors the server's read schema, so a single bad stored value
 * cannot blank a whole book in the UI.
 */
export const BookMetadataResponseSchema = z.object({
  pageCount: z.number().int().nonnegative().nullable().catch(null),
  publishedDate: z.string().nullable().catch(null),
  categories: z.array(z.string()).catch(() => []),
  language: z.string().nullable().catch(null),
  isbn: z.string().nullable().catch(null),
  thumbnailUrl: z.url().nullable().catch(null),
});

export const BookResponseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataResponseSchema,
});

export const GetBooksResponseSchema = z.array(BookResponseSchema);
