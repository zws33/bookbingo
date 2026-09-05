# Zod Boundary Validation — Implementation Plan

Companion to `docs/zod-boundary-schemas.md`. Execute steps in order. Do not reorder. Do not add scope.

## Fixed decisions

These are settled. Do not re-evaluate them.

| Decision                                     | Value                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Per-document parse failure in a subscription | Skip the failing document, `log.error`, deliver the rest                                         |
| Callable response parse failure              | Throw; the caller's existing catch handles it                                                    |
| Unknown fields on reads                      | Strip (zod default). Do not use `.strict()`                                                      |
| Firestore write payload parsing              | Out of scope. Do not add write schemas                                                           |
| `lib/types` zod dependency                   | Add it                                                                                           |
| Zod import specifier                         | `import z from 'zod/v4';` everywhere, matching `functions/src/books/providers/open-library.ts:1` |
| Zod version                                  | `^4.4.2`, matching `functions/package.json`                                                      |

## Verified toolchain constraints

Confirmed by execution against this repo's zod 4.4.2 and tsconfig. Treat as fact.

1. `exactOptionalPropertyTypes: true` is set in `lib/tsconfig/base.json`. Zod emits every optional key as `T | undefined`, which is **not** assignable to a domain `field?: T`. Therefore: **schema output is never assigned directly to a domain type.** Mappers assemble optional keys with conditional spread, exactly as the current code does.
2. `z.string().default('User')` rejects `null`. Use `.catch('User')` where a `null` must be replaced.
3. `z.partialRecord(z.enum(['openLibrary']), …)` rejects unknown provider keys.
4. `FirestoreTimestamp.transform(…).optional()` rejects `null`. Pending `serverTimestamp()` reads as `null`. Always apply `.nullish()` before `.transform()`.
5. `z.string().trim().min(1)` rejects a whitespace-only string and outputs the trimmed value.
6. `verbatimModuleSyntax: true` is set. Type-only imports must use `import type`.
7. A key absent from input stays absent from output for `.nullish().transform()` fields at runtime; only the static type carries `| undefined`.

## Step 1 — Dependencies

1. Add `"zod": "^4.4.2"` to `dependencies` in `lib/types/package.json`.
2. Add `"zod": "^4.4.2"` to `dependencies` in `app/web/package.json`.
3. Run `pnpm install` from the repo root.

## Step 2 — Shared wire schemas in `lib/types`

Create `lib/types/src/schemas.ts`:

```ts
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

export const EnrichBookRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('search'), query: z.string().trim().min(1) }),
  z.object({
    action: z.literal('lookup'),
    externalId: z.string().trim().min(1),
  }),
]);

export const SubmitFeedbackRequestSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
});

export const SubmitFeedbackResponseSchema = z.object({
  issueUrl: z.string(),
  issueNumber: z.number().int().positive(),
});
```

Append to `lib/types/src/index.ts`:

```ts
export * from './schemas.js';
```

Do not delete or modify the existing interfaces in `lib/types/src/index.ts`. They stay as the domain types.

## Step 3 — Functions: request validation

### 3a. `functions/src/books/handler.ts`

Replace lines 30–64 (from `const data = request.data as EnrichBookData;` through the final `throw`) with:

```ts
const parsed = EnrichBookRequestSchema.safeParse(request.data);
if (!parsed.success) {
  throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
}

if (parsed.data.action === 'search') {
  return service.searchBooks(parsed.data.query);
}

try {
  return await service.getBookDetails(parsed.data.externalId);
} catch (error) {
  throw new HttpsError('not-found', (error as Error).message);
}
```

Add imports: `import z from 'zod/v4';` and `import { EnrichBookRequestSchema } from '@bookbingo/lib-types';`.
Delete the now-unused `EnrichBookAction` type and `EnrichBookData` interface (lines 9–15).

### 3b. `functions/src/feedback/handler.ts`

Replace lines 33–63 (from `const data = request.data as SubmitFeedbackData;` through the last length check) with:

```ts
const parsed = SubmitFeedbackRequestSchema.safeParse(request.data);
if (!parsed.success) {
  throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
}
const { type, title, description } = parsed.data;
```

Values are already trimmed by the schema. Replace the later `title.trim()` and `description.trim()` in the `fetch` body (lines 76–77) with `title` and `description`.
Delete the `FeedbackType` type and `SubmitFeedbackData` interface (lines 9–15).
Keep the exported `TITLE_MAX_LENGTH` and `DESCRIPTION_MAX_LENGTH` constants; reference them in the schema if the schema is moved local, otherwise leave them exported for the existing tests.

### 3c. `functions/src/feedback/handler.ts` — GitHub response

Replace lines 94–99 with:

```ts
const issue = GitHubIssueResponseSchema.parse(await response.json());
return { issueUrl: issue.html_url, issueNumber: issue.number };
```

Define above the handler in the same file:

```ts
const GitHubIssueResponseSchema = z.object({
  html_url: z.string(),
  number: z.number().int().positive(),
});
```

### 3d. Add `@bookbingo/lib-types` to `functions/package.json`

Add `"@bookbingo/lib-types": "workspace:*"` to `dependencies` if absent, then `pnpm install`.

## Step 4 — Web: Firestore document schemas

Create `app/web/src/data/schemas.ts`:

```ts
import z from 'zod/v4';
import { BookMetadataSchema, BookProviderSchema } from '@bookbingo/lib-types';

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
  name: z.string().catch('User'),
  photoURL: z.string().nullish(),
});

export const AuthUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullable(),
  photoURL: z.string().nullable(),
});
```

## Step 5 — Web: shared skip-on-failure helper

Append to `app/web/src/data/schemas.ts`:

```ts
import { log } from '@bookbingo/lib-util';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

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
```

## Step 6 — Web: apply schemas in mappers

Rule for every mapper: call `Schema.parse(doc.data())`, then build the domain object field by field. Never `return { id, ...parsed }`. Optional keys use `...(value !== undefined && { key: value })`.

### 6a. `app/web/src/data/books.ts`

Replace `toBook` (lines 106–118) and delete `toExternalIds` (lines 120–133) and `tsToDate` (lines 102–104):

```ts
function toBook(doc: QueryDocumentSnapshot): Book {
  const data = BookDocSchema.parse(doc.data());
  return {
    id: doc.id,
    title: data.title,
    author: data.author,
    ...(data.metadata !== undefined && { metadata: data.metadata }),
    ...(data.externalIds !== undefined && { externalIds: data.externalIds }),
    createdBy: data.createdBy,
    createdAt: data.createdAt,
  };
}
```

In `subscribeToBooks` (line 44), replace `snap.docs.map(toBook)` with `mapValid('books', snap.docs, toBook)`.

### 6b. `app/web/src/data/readings.ts`

Replace `toReading` (lines 200–211):

```ts
function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = ReadingDocSchema.parse(doc.data());
  return {
    id: doc.id,
    bookId: data.bookId,
    ...(data.bookTitle !== undefined && { bookTitle: data.bookTitle }),
    ...(data.bookAuthor !== undefined && { bookAuthor: data.bookAuthor }),
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    readAt: data.readAt,
    createdAt: data.createdAt,
    ...(data.updatedAt !== undefined && { updatedAt: data.updatedAt }),
  };
}
```

Replace `snap.docs.map(toReading)` at lines 50 and 64 with `mapValid('readings', snap.docs, toReading)`.

In `readingsByUser` (lines 181–198), wrap the per-document body in `try`/`catch`; on catch, `log.error('readings', …)` and `continue`.

### 6c. `app/web/src/data/tbr.ts`

Replace `toTBREntry` (lines 166–178):

```ts
function toTBREntry(doc: QueryDocumentSnapshot): TBREntry {
  const data = TBREntryDocSchema.parse(doc.data());
  return {
    id: doc.id,
    bookId: data.bookId,
    plannedTiles: data.plannedTiles,
    ...(data.notes !== undefined && { notes: data.notes }),
    addedAt: data.addedAt,
    ...(data.updatedAt !== undefined && { updatedAt: data.updatedAt }),
  };
}
```

Replace `snap.docs.map(toTBREntry)` at line 60 with `mapValid('tbr', snap.docs, toTBREntry)`.

### 6d. `app/web/src/data/users.ts`

Replace `toUserProfile` (lines 39–46):

```ts
export function toUserProfile(doc: DocumentSnapshot): UserProfile {
  const data = UserProfileDocSchema.parse(doc.data() ?? {});
  return {
    id: doc.id,
    name: data.name,
    ...(data.photoURL != null && { photoURL: data.photoURL }),
  };
}
```

Replace `snap.docs.map(toUserProfile)` at line 26 with `mapValid('users', snap.docs, toUserProfile)`.

`UserProfileDocSchema` has no required fields, so `parse({})` succeeds and `name` falls back to `'User'`. Verify this in a test rather than assuming.

## Step 7 — Web: auth boundary

In `app/web/src/lib/auth.ts`, add an exported narrowed type and parse in the subscription callback:

```ts
export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

export function subscribeToAuthState(
  onData: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(
    auth,
    (user) => {
      if (user === null) {
        onData(null);
        return;
      }
      const parsed = AuthUserSchema.safeParse(user);
      if (!parsed.success) {
        onError(
          new Error(`Invalid auth user: ${z.prettifyError(parsed.error)}`),
        );
        return;
      }
      onData(parsed.data);
    },
    onError,
  );
}
```

`signInWithGoogle` keeps returning the SDK `User`. Do not change it.

Then update consumers:

- `app/web/src/hooks/useAuth.ts:3,7` — replace the `firebase/auth` `User` import with `AuthUser` from `../lib/auth`.
- `app/web/src/data/userProfile.ts:8,21` — change `saveUserProfile(user: User)` to `saveUserProfile(user: AuthUser)`; the body already reads only `uid`, `displayName`, `photoURL`.
- Run `pnpm --filter @bookbingo/web exec tsc --noEmit -p tsconfig.json` and fix every remaining `User` type error by switching that import to `AuthUser`. Do not widen `AuthUser` to add fields; if a consumer needs a field outside the three, stop and report it.

## Step 8 — Web: callable response validation

Replace `app/web/src/lib/bookSearch.ts` lines 12–22:

```ts
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const result = await enrichBook({ action: 'search', query });
  return SearchBooksResponseSchema.parse(result.data);
}

export async function lookupBook(
  externalId: string,
): Promise<BookEnrichmentResult> {
  const result = await enrichBook({ action: 'lookup', externalId });
  return BookEnrichmentResultSchema.parse(result.data);
}
```

In `app/web/src/components/FeedbackModal.tsx`, wrap the call at line 43:

```ts
const response = await submitFeedbackCallable({
  type,
  title: title.trim(),
  description: description.trim(),
});
SubmitFeedbackResponseSchema.parse(response.data);
```

The existing `catch` at line 53 already surfaces a failure through `showError`.

## Step 9 — Web: env config

Replace `app/web/src/lib/firebase.ts` lines 8–49 with a schema parse. Preserve the existing error text: it must still name the mode and every missing variable, and reference `app/web/.env.<mode>` and `app/web/.env.example`.

```ts
const FirebaseEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().min(1).optional(),
});

const env = FirebaseEnvSchema.safeParse(import.meta.env);
if (!env.success) {
  const vars = Object.keys(z.flattenError(env.error).fieldErrors).join(', ');
  throw new Error(
    `Firebase config is incomplete in mode "${import.meta.env.MODE}" — missing: ${vars}. ` +
      'Local dev reads app/web/.env.<mode>; CI reads GitHub secrets. See app/web/.env.example.',
  );
}

const firebaseConfig = {
  apiKey: env.data.VITE_FIREBASE_API_KEY,
  authDomain: env.data.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.data.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.data.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.data.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.data.VITE_FIREBASE_APP_ID,
  measurementId: env.data.VITE_FIREBASE_MEASUREMENT_ID,
};
```

Leave the explanatory comment at lines 20–26 in place above the parse.

## Step 10 — Tests

Add to the existing test files; do not create new ones except where noted.

| File                                       | Add                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `app/web/src/data/books.test.ts`           | valid doc maps; doc missing `title` is skipped and the rest are delivered; doc with unknown `externalIds` provider key is skipped |
| `app/web/src/data/readings.test.ts`        | valid doc maps; `tiles` not an array is skipped; pending `readAt: null` yields a `Date`; absent `updatedAt` leaves the key absent |
| `app/web/src/data/tbr.test.ts`             | valid doc maps; absent `notes` leaves the key absent; pending `addedAt: null` yields a `Date`                                     |
| `app/web/src/data/users.test.ts`           | `parse({})` yields `name === 'User'`; `photoURL: null` leaves the key absent                                                      |
| `app/web/src/lib/auth.test.ts`             | auth user missing `uid` routes to `onError`, not `onData`                                                                         |
| `app/web/src/lib/bookSearch.test.ts` (new) | malformed callable response rejects                                                                                               |
| `functions/src/books/handler.test.ts`      | `{action:'search',query:'  '}` throws `invalid-argument`; `{action:'bogus'}` throws `invalid-argument`                            |
| `functions/src/feedback/handler.test.ts`   | title over 200 chars throws `invalid-argument`; malformed GitHub response throws                                                  |

Existing tests that assert on hand-rolled error message strings will fail once `z.prettifyError` supplies the message. Update the assertion to check the `HttpsError` code (`invalid-argument`), not the message text.

Mock document data in tests must include every required field. Existing fixtures that omit one will now be skipped rather than mapped; update the fixture, do not loosen the schema.

## Step 11 — Verification

Run in order from the repo root. All must pass before the work is complete.

```
pnpm run format
pnpm run lint
pnpm run build
pnpm test
pnpm run typecheck
```

Then:

```
pnpm run test:integration
```

## Commits

One commit per step group, conventional format:

1. `chore: add zod to lib/types and app/web` (step 1)
2. `feat: add shared wire schemas for callable contracts` (step 2)
3. `refactor: validate callable requests and GitHub response with zod` (step 3)
4. `feat: add zod schemas for firestore document reads` (steps 4–5)
5. `refactor: validate firestore reads, skipping invalid documents` (step 6)
6. `refactor: narrow firebase auth user behind a zod schema` (step 7)
7. `refactor: validate callable responses with zod` (step 8)
8. `refactor: validate firebase env config with zod` (step 9)
9. `test: cover zod boundary validation` (step 10)

## Stop conditions

Stop and report rather than improvising if any of these occur:

- A consumer of `AuthUser` needs a `firebase/auth` `User` field beyond `uid`, `displayName`, `photoURL`.
- `pnpm run typecheck` reports a `TS2375` (`exactOptionalPropertyTypes`) error after applying the conditional-spread pattern.
- An existing test fixture cannot be made schema-valid without changing production behavior.
- Adding zod to `lib/types` breaks `lib/core` or `lib/util` builds.
