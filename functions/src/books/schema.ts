import { z } from 'zod/v4';

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
