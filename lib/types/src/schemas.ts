import z from 'zod/v4';

export const BookProviderSchema = z.enum(['openLibrary']);

export const BookMetadataSchema = z.object({
  pageCount: z.number().int().nonnegative().nullable(),
  publishedDate: z.string().nullable(),
  categories: z.array(z.string()),
  language: z.string().nullable(),
  isbn: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});

export const BookSearchResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  thumbnailUrl: z.string().nullable(),
  publishedDate: z.string().nullable(),
});

export const SearchBooksResponseSchema = z.array(BookSearchResultSchema);

export const BookEnrichmentResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataSchema,
});

export const SubmitFeedbackResponseSchema = z.object({
  issueUrl: z.string(),
  issueNumber: z.number().int().positive(),
});
