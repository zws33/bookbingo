import z from 'zod/v4';
import {
  CHALLENGE_STATUSES,
  MEMBER_ROLES,
  MEMBERSHIP_STATUSES,
} from './challenges';

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
 * A book as stored: the cover is the only catalog metadata kept. The client
 * takes its `Book` from this schema rather than `@bookbingo/lib-types`, whose
 * six-field version is what the retiring v1 endpoints still return.
 */
export const BookResponseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  author: z.string(),
  thumbnailUrl: z.url().nullable().catch(null),
});
export type Book = z.infer<typeof BookResponseSchema>;

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
  userId: z.string().min(1),
  bookId: z.string().min(1),
  book: BookResponseSchema,
  tagIds: z.array(z.string()),
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
  tagIds: z.array(z.string()),
});

export const LibraryBookSchema = z.object({
  book: BookResponseSchema,
  readCount: z.number().int().nonnegative(),
  uniqueTagIds: z.array(z.string()),
  readers: z.array(LibraryReaderSchema),
});
export type LibraryBook = z.infer<typeof LibraryBookSchema>;

export const GetLibraryResponseSchema = z.array(LibraryBookSchema);

/** A planned reading, with its book resolved by the server. */
export const TBREntrySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  bookId: z.string().min(1),
  book: BookResponseSchema,
  plannedTagIds: z.array(z.string()),
  notes: z.string().optional(),
  addedAt: Instant,
  updatedAt: Instant.optional(),
});
export type TBREntry = z.infer<typeof TBREntrySchema>;

export const ListTBRResponseSchema = z.array(TBREntrySchema);

const ChallengeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(CHALLENGE_STATUSES),
  tagCap: z.number().int().positive(),
  createdBy: z.string().min(1),
  createdAt: Instant,
});

const MembershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(MEMBER_ROLES),
  status: z.enum(MEMBERSHIP_STATUSES),
  joinedAt: Instant,
});

/** The roster row, profile included — see `Member`. */
const MemberSchema = MembershipSchema.extend({
  name: z.string(),
  photoURL: z.string().nullable().catch(null),
});

export const GetMyChallengesResponseSchema = z.object({
  challenges: z.array(
    z.object({ challenge: ChallengeSchema, membership: MembershipSchema }),
  ),
});

export const GetChallengeResponseSchema = z.object({
  challenge: ChallengeSchema,
  members: z.array(MemberSchema),
  joinCode: z.string().min(1),
});

export const CreateChallengeResponseSchema = z.object({
  challengeId: z.string().min(1),
  joinCode: z.string().min(1),
});

export const JoinChallengeResponseSchema = z.object({
  challengeId: z.string().min(1),
});
