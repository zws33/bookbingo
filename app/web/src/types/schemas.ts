import type { Book } from '@bookbingo/lib-types';
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
}) satisfies z.ZodType<Book>;

export const UserProfileResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  photoURL: z.string().nullable().catch(null),
});

export const ListUsersResponseSchema = z.array(UserProfileResponseSchema);

/** A profile that was never written is a normal outcome, not an error. */
export const GetUserProfileResponseSchema =
  UserProfileResponseSchema.nullable();

export const LeaderboardRowSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  photoURL: z.string().nullable().catch(null),
  score: z.number(),
  bookCount: z.number().int().nonnegative(),
});

export const GetLeaderboardResponseSchema = z.array(LeaderboardRowSchema);
export type LeaderboardRow = z.infer<typeof LeaderboardRowSchema>;

/** Instants cross the wire as ISO strings; the UI works in Dates. */
const Instant = z.iso.datetime().transform((value) => new Date(value));

/**
 * A reading with its book already resolved by the server. The client renders
 * these fields as they arrive and never joins a book onto a reading itself.
 */
export const ReadingSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  bookTitle: z.string(),
  bookAuthor: z.string(),
  bookMetadata: BookMetadataResponseSchema,
  tiles: z.array(z.string()),
  isFreebie: z.boolean(),
  readAt: Instant,
  createdAt: Instant,
  updatedAt: Instant.optional(),
});
export type Reading = z.infer<typeof ReadingSchema>;

export const ScoreSchema = z.object({
  score: z.number(),
  varietyPoints: z.number(),
  volumePoints: z.number(),
  balanceFactor: z.number(),
  tileCounts: z.record(z.string(), z.number()),
  totalBooks: z.number().int().nonnegative(),
});
export type Score = z.infer<typeof ScoreSchema>;

export const ListReadingsResponseSchema = z.object({
  readings: z.array(ReadingSchema),
  score: ScoreSchema,
});

export const LibraryReaderSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  photoURL: z.string().nullable().catch(null),
  tiles: z.array(z.string()),
});

export const LibraryBookSchema = z.object({
  book: BookResponseSchema,
  readCount: z.number().int().nonnegative(),
  uniqueTiles: z.array(z.string()),
  readers: z.array(LibraryReaderSchema),
});
export type LibraryBook = z.infer<typeof LibraryBookSchema>;

export const GetLibraryResponseSchema = z.array(LibraryBookSchema);

/** A planned reading, with its book resolved by the server. */
export const TBREntrySchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  bookTitle: z.string(),
  bookAuthor: z.string(),
  bookMetadata: BookMetadataResponseSchema,
  plannedTiles: z.array(z.string()),
  notes: z.string().optional(),
  addedAt: Instant,
  updatedAt: Instant.optional(),
});
export type TBREntry = z.infer<typeof TBREntrySchema>;

export const ListTBRResponseSchema = z.array(TBREntrySchema);
