# Book Type Architecture Plan

Separates the Open Library response shape from the domain book model, and makes `metadata` a required container whose fields can change without touching the client contract. Follows the server-only book creation work in `9ad3544`; no data migration required.

## The coupling today

`BookMetadata` is one type doing three jobs:

| Job                                             | Consumer                                                      |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Provider output payload                         | `providers/open-library.ts:219` `getDetails()`                |
| Stored `/books` document field                  | `handler.ts:155`, `manual.ts` `CreateManualBookRequestSchema` |
| Client view model for the read-only book dialog | `BookList.tsx:206-234` (4 of 6 fields)                        |

An Open Library change therefore reaches `app/web`, and a UX change reaches the provider contract. `BookEnrichmentResult` (`lib/types/src/index.ts:104`) compounds this: it lives in the client-visible shared package but is meaningful only inside `functions/`.

`BookMetadata`'s doc comment defines it by source ("sourced from external APIs, e.g. Google Books") rather than role. The prose encodes the coupling too.

## Objective

One owner per contract. `lib/types` holds the domain and the wire contract, never a provider's output shape.

| Contract                               | Owner     | Lives in                                        | Changes when                     |
| -------------------------------------- | --------- | ----------------------------------------------- | -------------------------------- |
| `WorkSchema`, `SearchResponseSchema`   | provider  | `functions/src/books/providers/open-library.ts` | Open Library changes             |
| `ProviderBookDetails`                  | functions | `functions/src/books/types.ts`                  | a provider is added or swapped   |
| `Book`, `BookMetadata`                 | domain    | `lib/types`                                     | the product's book model changes |
| `BookLookupResult`, `BookSearchResult` | wire      | `lib/types`                                     | the callable contract changes    |

After the move, a client type cannot depend on a provider shape — `app/web` cannot import from `functions/`.

`BookSearchResult` already follows this: it carries `thumbnailUrl`/`publishedDate` inline as a search-row view model, not as `BookMetadata`. Leave it as is.

## Files to change

- `lib/types/src/index.ts` — delete `BookEnrichmentResult`; `BookLookupResult` becomes core-only; `Book.metadata` required
- `lib/types/src/schemas.ts` — delete `BookEnrichmentResultSchema`; `BookLookupResultSchema` standalone
- `functions/src/books/types.ts` — define `ProviderBookDetails` locally; drop the `BookEnrichmentResult` re-export
- `functions/src/books/handler.ts` — `bookDetails` and `createBook`'s param retype; return `{ bookId, title, author }`
- `functions/src/books/providers/open-library.ts` — `getDetails()` return type
- `app/web/src/data/schemas.ts` — `metadata` required with per-field `.catch()`
- `app/web/src/data/books.ts` — `toBook` no longer spreads `metadata` conditionally
- `app/web/src/components/BookList.tsx` — drop the second-level `?.` on metadata reads

## Ordered steps

**1. Move the provider type into `functions/`.** Rename `BookEnrichmentResult` → `ProviderBookDetails`, defined in `functions/src/books/types.ts`. Delete `BookEnrichmentResultSchema` — it is never used as a validator, only as the `.extend()` base at `schemas.ts:31`.

**2. Shrink `BookLookupResult` to the core.** Every client read touches only `bookId`/`title`/`author` (`MyBooksPage.tsx:92,155,156`; `ReadingListPage.tsx:61,234,235`). Neither `metadata` nor `externalId` is read.

```ts
export interface BookCore {
  bookId: string;
  title: string;
  author: string;
}
export interface BookLookupResult extends BookCore {}
```

The wire contract stops referencing `BookMetadata`, so metadata's shape can change without touching it. Metadata reaches the client through the `/books` subscription (`useBooks` → `booksById`), the single source of truth.

**3. Make `metadata` required on `Book`.** Both server writers already guarantee it: `handler.ts:155` always writes `enrichment.metadata`, and `CreateManualBookRequestSchema` validates it as required. Only legacy documents lack it, so the read path backfills:

```ts
// app/web/src/data/schemas.ts — total by construction
const BookMetadataReadSchema = z
  .object({
    pageCount: z.number().int().nonnegative().nullable().catch(null),
    publishedDate: z.string().trim().max(200).nullable().catch(null),
    categories: z.array(z.string().trim().max(200)).catch([]),
    language: z.string().trim().max(200).nullable().catch(null),
    isbn: z.string().trim().max(200).nullable().catch(null),
    thumbnailUrl: z.url().nullable().catch(null),
  })
  .default(EMPTY_METADATA);
```

Per-field `.catch()` preserves partial data — one bad `thumbnailUrl` no longer discards a good `pageCount`. Object-level `.default()` covers the absent case. This subsumes `ReadThumbnailUrl` (`schemas.ts:39`); keep `warnIfThumbnailDropped` since it compares raw against parsed.

**4. Redefine metadata by role.** "Everything known about a book beyond its identity. Every field is nullable or empty-able; the container is always present." That invariant is what makes the struct evolvable: adding a field is backward-compatible via the read default, removing one is a client-side deletion.

## Validation

- `pnpm run verify`
- `grep -rn "BookEnrichmentResult" lib/ app/` returns nothing
- `Book.metadata` is required, and no call site needs `?.metadata?.`
- A `/books` document with no `metadata` field still renders; one with an invalid `thumbnailUrl` keeps its other fields

## Risks

- **Snapshot latency.** Dropping metadata from the lookup response means a just-added book renders from the `/books` snapshot rather than the response. The listener is live, so the window is sub-second, and only title/author display is affected.
- **Write path is the only guarantee.** The required `metadata` invariant holds because both callables write a full object. A third writer that skips it would break the type's promise silently — any new `/books` writer must write `metadata`.
- **Don't make metadata an open bag.** `Record<string, unknown>` forfeits type safety at the four `BookList.tsx` read sites. The fixed struct is not what makes shape changes expensive; the three-jobs problem is.
