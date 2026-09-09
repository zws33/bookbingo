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
