# Zod Boundary Schemas

Scope: every seam where data crosses into the application from outside its own type system. Shapes only; no implementation.

Current state: `zod@^4.4.2` is a `functions/` dependency and parses Open Library responses (`functions/src/books/providers/open-library.ts`). No other boundary validates. `app/web` has no zod dependency.

## Boundary inventory

| #   | Boundary                                    | Direction      | Site                                                               | Current check                    |
| --- | ------------------------------------------- | -------------- | ------------------------------------------------------------------ | -------------------------------- |
| 1   | Firestore `/books/{bookId}`                 | in             | `app/web/src/data/books.ts:106` `toBook`                           | none — `any` field reads         |
| 2   | Firestore `/users/{uid}/readings/{id}`      | in             | `app/web/src/data/readings.ts:200` `toReading`                     | none                             |
| 3   | Firestore collectionGroup `readings`        | in             | `app/web/src/data/readings.ts:181` `readingsByUser`                | none                             |
| 4   | Firestore `/users/{uid}/tbr/{id}`           | in             | `app/web/src/data/tbr.ts:166` `toTBREntry`                         | none                             |
| 5   | Firestore `/users/{uid}`                    | in             | `app/web/src/data/users.ts:39` `toUserProfile`                     | `??` fallbacks only              |
| 6   | Firebase Auth `User`                        | in             | `app/web/src/lib/auth.ts:13` `subscribeToAuthState`                | SDK types, unverified at runtime |
| 7   | Callable `enrichBook` response              | in             | `app/web/src/lib/bookSearch.ts:14,21`                              | `as` cast                        |
| 8   | Callable `submitFeedback` response          | in             | `app/web/src/components/FeedbackModal.tsx:43`                      | discarded                        |
| 9   | Callable `enrichBook` request               | in (functions) | `functions/src/books/handler.ts:30`                                | hand-rolled `if` chain           |
| 10  | Callable `submitFeedback` request           | in (functions) | `functions/src/feedback/handler.ts:33`                             | hand-rolled `if` chain           |
| 11  | Open Library REST                           | in (functions) | `functions/src/books/providers/open-library.ts:8-37`               | **zod, done**                    |
| 12  | GitHub Issues API response                  | in (functions) | `functions/src/feedback/handler.ts:94`                             | `as` cast                        |
| 13  | Vite `import.meta.env`                      | in             | `app/web/src/lib/firebase.ts:8-49`                                 | manual presence loop             |
| 14  | Firestore writes (book/reading/tbr/profile) | out            | `books.ts:77`, `readings.ts:158`, `tbr.ts:72`, `userProfile.ts:21` | none                             |

## Transport object shapes

Firestore document payloads differ from the domain types in `lib/types`:

| Domain field                                      | Domain type                                  | Firestore transport type                                                                 |
| ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                                              | `string`                                     | absent — it is `doc.id`, the key                                                         |
| `createdAt` / `readAt` / `addedAt` / `enrichedAt` | `Date`                                       | `Timestamp` \| `null` while a `serverTimestamp()` write is pending in the local snapshot |
| `updatedAt`                                       | `Date \| undefined`                          | `Timestamp` \| absent                                                                    |
| `externalIds`                                     | `Partial<Record<BookProvider, ExternalRef>>` | map, provider keys unconstrained on the wire                                             |

Consequence: each Firestore schema parses `doc.data()` and outputs the domain type minus `id`; `id` is merged from `doc.id` after parse.

## Shared primitives

```ts
// Structural, so lib/ keeps no firebase import.
const FirestoreTimestamp = z.custom<{ toDate(): Date }>(
  (v) => typeof (v as { toDate?: unknown })?.toDate === 'function',
);

/** Required instant. null/undefined = pending serverTimestamp() -> now. */
const ServerInstant = FirestoreTimestamp.nullish().transform(
  (t) => t?.toDate() ?? new Date(),
);

/** Optional instant. Absent stays absent. */
const OptionalInstant = FirestoreTimestamp.nullish().transform((t) =>
  t?.toDate(),
);
```

## Firestore read schemas

```ts
const BookMetadataSchema = z.object({
  pageCount: z.number().int().nonnegative().nullable(),
  publishedDate: z.string().nullable(),
  categories: z.array(z.string()),
  language: z.string().nullable(),
  isbn: z.string().nullable(),
  thumbnailUrl: z.url().nullable(),
});

const ExternalRefSchema = z.object({
  key: z.string().min(1),
  enrichedAt: ServerInstant,
});

const BookProviderSchema = z.enum(['openLibrary']);

const BookDocSchema = z.object({
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataSchema.optional(),
  externalIds: z
    .partialRecord(BookProviderSchema, ExternalRefSchema)
    .optional(),
  createdBy: z.string().min(1),
  createdAt: ServerInstant,
});

const ReadingDocSchema = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().optional(), // legacy, Parallel Change migration
  bookAuthor: z.string().optional(), // legacy, Parallel Change migration
  tiles: z.array(z.string()),
  isFreebie: z.boolean(),
  readAt: ServerInstant,
  createdAt: ServerInstant,
  updatedAt: OptionalInstant,
});

const TBREntryDocSchema = z.object({
  bookId: z.string().min(1),
  plannedTiles: z.array(z.string()),
  notes: z.string().optional(),
  addedAt: ServerInstant,
  updatedAt: OptionalInstant,
});

const UserProfileDocSchema = z.object({
  name: z.string().default('User'),
  photoURL: z.string().nullish(),
  updatedAt: OptionalInstant,
});
```

Behavior deltas against today's mappers:

| Schema                      | Delta                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `BookDocSchema.externalIds` | `partialRecord` rejects unknown provider keys; `toExternalIds` passes them through                            |
| `UserProfileDocSchema.name` | `.default` fires on `undefined` only; today `??` also replaces `null` — use `.catch('User')` to preserve that |
| all                         | `.strict()` vs pass-through on unknown fields is unset; default `strip` matches current mapper behavior       |

## Firestore write schemas

Write payloads carry sentinels, not values, so they are separate schemas from the read side.

```ts
const ServerTimestampSentinel = z.custom<FieldValue>(
  (v) => v instanceof FieldValue,
);

const BookCreateSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  metadata: BookMetadataSchema.optional(),
  externalIds: z
    .partialRecord(
      BookProviderSchema,
      z.object({ key: z.string().min(1), enrichedAt: ServerTimestampSentinel }),
    )
    .optional(),
  createdBy: z.string().min(1),
  createdAt: ServerTimestampSentinel,
});

const ReadingCreateSchema = z.object({
  bookId: z.string().min(1),
  tiles: z.array(z.string()).max(3), // unbounded when isFreebie
  isFreebie: z.boolean(),
  readAt: ServerTimestampSentinel,
  createdAt: ServerTimestampSentinel,
});

const TBRCreateSchema = z.object({
  bookId: z.string().min(1),
  plannedTiles: z.array(z.string()),
  notes: z.string().min(1).optional(),
  addedAt: ServerTimestampSentinel,
});
```

The `tiles.max(3)` bound is conditional on `isFreebie` (`lib/types` `Reading`); express as a `.refine` on the object, not a field constraint.

## Firebase Auth

Consumed fields only: `uid`, `displayName`, `photoURL` (`useAuth.ts`, `userProfile.ts:21`).

```ts
const AuthUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullable(),
  photoURL: z.string().nullable(),
  email: z.email().nullable(),
  emailVerified: z.boolean(),
});
```

Applied at `subscribeToAuthState`, narrowing the SDK `User` class instance to a plain object. Downstream consumers currently take `firebase/auth`'s `User` type; narrowing removes that import from hooks and components.

## Callable contracts

Request schemas replace the `if` chains in both handlers; response schemas replace the `as` casts in `app/web`. Both sides parse.

```ts
// enrichBook — request
const EnrichBookRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('search'), query: z.string().trim().min(1) }),
  z.object({
    action: z.literal('lookup'),
    externalId: z.string().trim().min(1),
  }),
]);

// enrichBook — responses
const BookSearchResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  thumbnailUrl: z.url().nullable(),
  publishedDate: z.string().nullable(),
});
const SearchBooksResponseSchema = z.array(BookSearchResultSchema);

const BookEnrichmentResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string(),
  author: z.string(),
  metadata: BookMetadataSchema,
});

// submitFeedback — request
const SubmitFeedbackRequestSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string().trim().min(1).max(200), // TITLE_MAX_LENGTH
  description: z.string().trim().min(1).max(2000), // DESCRIPTION_MAX_LENGTH
});

// submitFeedback — response
const SubmitFeedbackResponseSchema = z.object({
  issueUrl: z.url(),
  issueNumber: z.number().int().positive(),
});
```

`EnrichBookRequestSchema` as a discriminated union removes the `action === 'lookup'` fallthrough that currently returns the generic "Invalid action" error after two other branches.

## GitHub Issues API

```ts
const GitHubIssueResponseSchema = z.object({
  html_url: z.url(),
  number: z.number().int().positive(),
});
```

Parsed at `functions/src/feedback/handler.ts:94`, unknown fields stripped.

## Environment config

```ts
const FirebaseEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().min(1).optional(),
  VITE_USE_EMULATOR: z.stringbool().catch(false),
});
```

Replaces the `missing` array loop in `firebase.ts:27-49`. The thrown error must keep naming every absent variable and the current mode — a `ZodError` message alone loses the `.env.<mode>` / CI-secrets guidance.

## Placement

| Schemas                                                               | Package                       | Reason                                                           |
| --------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| Callable request/response, `BookMetadataSchema`, `BookProviderSchema` | `lib/types`                   | shared by `app/web` and `functions`; one definition per contract |
| Firestore read/write, `AuthUserSchema`                                | `app/web/src/data/schemas.ts` | `functions` never reads Firestore or Auth state                  |
| Open Library, GitHub                                                  | `functions/src/**` (existing) | provider-local, not shared                                       |
| `FirebaseEnvSchema`                                                   | `app/web/src/lib/firebase.ts` | single call site                                                 |

Adding zod to `lib/types` converts it from a types-only package to one with a runtime dependency and a runtime bundle contribution. `lib/` framework-agnosticism holds — zod is neither React nor Firebase, and `FirestoreTimestamp` is structural.

## Open decisions

| Decision                                              | Options                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-document parse failure in a snapshot subscription | reject the whole snapshot to `onError`; or skip the bad document, log, deliver the rest                                                            |
| Unknown-field policy on Firestore reads               | `strip` (matches today, tolerates the legacy `bookTitle`/`bookAuthor` fields); `strict` (surfaces schema drift, breaks on migration-era documents) |
| Write-path parsing                                    | parse before every write (catches app bugs, costs a parse per write); or types-only, reads parsed                                                  |
| `lib/types` zod dependency                            | accept the runtime dep; or duplicate wire schemas in each consumer                                                                                 |
