import z from 'zod/v4';

export const BookProviderSchema = z.enum(['openLibrary']);

export const BookMetadataSchema = z.object({
  pageCount: z.number().int().nonnegative().nullable(),
  publishedDate: z.string().trim().max(200).nullable(),
  categories: z.array(z.string().trim().max(200)),
  language: z.string().trim().max(200).nullable(),
  isbn: z.string().trim().max(200).nullable(),
  thumbnailUrl: z.url().nullable(),
});

export const BookSearchResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  thumbnailUrl: z.url().nullable(),
  publishedDate: z.string().nullable(),
});

export const SearchBooksResponseSchema = z.array(BookSearchResultSchema);

export const BookEnrichmentResultSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().max(200),
  author: z.string().max(200),
  metadata: BookMetadataSchema,
});

export const BookLookupResultSchema = BookEnrichmentResultSchema.extend({
  bookId: z.string().min(1),
});

export const CreateManualBookResponseSchema = z.object({
  bookId: z.string().min(1),
});

export const SubmitFeedbackResponseSchema = z.object({
  issueUrl: z.string(),
  issueNumber: z.number().int().positive(),
});
