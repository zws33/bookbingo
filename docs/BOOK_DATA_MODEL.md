# Book Data Model Architecture

This document describes the engineering design for how BookBingo models, stores, and deduplicates books. The central design decision is to track books at the **Work** level — the abstract intellectual creation — rather than at the edition level (a specific printing or publication).

> **⚠️ Partially superseded (2026-06-19).** The **deduplication mechanism** described here (random doc IDs + a `where('externalIds.openLibrary','==',…)` query) has been replaced by **deterministic, hash-derived document IDs**. See `docs/decisions/book-identity-and-deduplication.md` for the authoritative model. The provider architecture, Open Library API reference, metadata mapping, search UX, and security rules in this doc remain accurate. Sections affected by the change are flagged inline below.

---

## Design Goals

1. **Track works, not editions.** A book club cares about "I read Crime and Punishment," not "I read the 2004 Penguin Classics paperback." The data model anchors on Work-level identity so that different members reading different editions of the same book are recognized as having read the same work.

2. **Books as source of truth.** The `/books/` collection is the canonical registry of all book entities. A `Reading` must always reference a valid `Book`. Referential integrity is enforced at the database layer via Firestore security rules.

3. **Open Library as the primary provider.** Open Library's API returns Work-level records by default and models books using a subset of the FRBR Work/Edition hierarchy. Work OLIDs (e.g., `/works/OL166894W`) are stable, edition-agnostic identifiers suitable as deduplication keys.

4. **Metadata is required.** All book entities must carry a `metadata` object. Individual fields within the object may be null, but the object itself must always be present.

5. **Deduplication by deterministic doc ID.** ~~For API-sourced books, the `externalIds.openLibrary` Work OLID is the deduplication key. Manual-entry books skip deduplication.~~ *Superseded:* the document ID is now a hash derived from the Work OLID (catalog books) or from a normalized title+author key (manual books), so dedup is a `getDoc` on the computed ID rather than a query. Manual books **also** dedup. See the identity decision record.

6. **Remove `titleLower` / `authorLower`.** These write-time normalization fields were used for case-insensitive deduplication. They are superseded by OLID-based dedup for API-sourced books and will be cleaned up from existing documents via migration.

---

## Why Work OLIDs Instead of ISBNs or Edition IDs

**ISBN** is edition-specific. A hardcover, a paperback, and an ebook of the same book each carry different ISBNs. Using ISBN as a deduplication key would create separate book records for the same work, which is the problem we are trying to solve.

**Edition-specific catalog IDs** (such as those used by commercial book APIs) also identify specific publications, not works. Two different printings of the same book have different IDs.

**Open Library Work OLIDs** identify the abstract intellectual creation. All editions of Crime and Punishment share one Work OLID. Searching the Open Library API returns Work-level records by default — no extra normalization step is required.

---

## Type Model

### `BookProvider`

```ts
// lib/types/src/index.ts
export type BookProvider = 'openLibrary';
```

Enumerates all supported external catalog providers.

### `ExternalBookIds`

> **Updated 2026-06-19** — value is now an `ExternalRef` object (provenance metadata), not a bare string. See the identity decision record.

```ts
// lib/types/src/index.ts
export interface ExternalRef {
  key: string;       // provider-native id, e.g. "/works/OL166894W"
  enrichedAt: Date;  // when this reference was attached
}

export type ExternalBookIds = Partial<Record<BookProvider, ExternalRef>>;
```

A map from provider to a reference *record* for a given book. For Open Library, `key` is the full Work key path (e.g., `"/works/OL166894W"`). Each entry is optional — manual-entry books have no external IDs. `externalIds` is **provenance only**: it no longer drives deduplication (the deterministic doc ID does), but `externalIds.openLibrary.key` remains queryable.

### `Book` (updated)

```ts
export interface Book {
  id: string;
  title: string;
  author: string;          // joined string, e.g. "Fyodor Dostoevsky"
  metadata: BookMetadata;  // required (was optional)
  externalIds?: ExternalBookIds; // replaces externalId?: string | null
  createdBy: string;
  createdAt: Date;
}
```

Removed fields (cleaned up by migration):
- `externalId?: string | null` — superseded by `externalIds`
- `titleLower` and `authorLower` — superseded by OLID-based dedup

### `BookMetadata`

```ts
export interface BookMetadata {
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
}
```

Shape is unchanged. The object itself is always required on `Book`. Individual fields may be null.

**Open Library field mapping:**
- `pageCount` — not available at the Work level; fetched from the first edition via `/works/{olid}/editions.json?limit=1` (`number_of_pages` field)
- `publishedDate` — from `first_publish_date` on the Work record
- `categories` — mapped from `subjects[]` on the Work record (flat string array)
- `language` — null for Work-level records (edition-specific); omitted for API-sourced books
- `isbn` — null for Work-level records (edition-specific); may be populated via manual entry
- `thumbnailUrl` — constructed from the Work's `covers[0]` ID: `https://covers.openlibrary.org/b/id/{cover_id}-M.jpg`

### `Reading` (unchanged)

The `Reading` shape is unchanged. The `bookTitle?` and `bookAuthor?` legacy fields remain pending future cleanup. New readings must always carry a valid `bookId`.

---

## Deduplication Strategy

> **⚠️ Superseded 2026-06-19.** The query-based strategy below is replaced by **deterministic, hash-derived document IDs**. Dedup is now `getDoc(deriveBookId(...))`, not a query, and it applies to manual books too. The authoritative spec — ID derivation, the frozen normalization pipeline, the hash, collapse-on-migration safety, and accepted limits — lives in `docs/decisions/book-identity-and-deduplication.md`. The original strategy is retained below for historical context.

### ~~API-sourced books (primary path)~~ *(superseded)*

When a user selects a book from Open Library search results:

1. Query `/books/` where `externalIds.openLibrary == selectedWorkOlid`
2. If a match exists → return the existing `bookId`
3. If no match → create a new `Book` with `externalIds.openLibrary`, `metadata`, and `createdBy` populated

### ~~Manual-entry books (fallback path)~~ *(superseded)*

Manual entry is reserved for obscure books that return no usable API results. Creates a new `Book` with user-supplied `metadata` and no `externalIds`. No deduplication is performed. Duplication risk for truly obscure books is accepted.

---

## Book Data Provider Architecture

### Cloud Function: `enrichBook`

The `enrichBook` callable Cloud Function lives in `functions/src/` and provides search and detail-lookup over an external provider. It is the backend for the book search UX and for the enrichment migration script.

Actions:
- `search` — queries the provider by title/author string, returns `BookSearchResult[]`
- `lookup` — fetches full metadata for a specific external ID, returns `BookEnrichmentResult`

### Provider Interface

```ts
// functions/src/books/types.ts
interface BookProvider {
  search(query: string): Promise<BookSearchResult[]>;
  lookup(externalId: string): Promise<BookEnrichmentResult>;
}
```

### `OpenLibraryProvider`

Lives at `functions/src/books/providers/open-library.ts`. Implements `BookProvider` against the Open Library API.

**`search(query)`** — calls `/search.json` with a `fields` projection:
```
GET /search.json?q={query}&fields=key,title,author_name,first_publish_year,cover_i&limit=10
```
Maps the response: `key` → `externalId` (full path, e.g., `/works/OL166894W`), `author_name[]` → joined `author` string, `cover_i` → constructed `thumbnailUrl`.

**`lookup(externalId)`** — three sequential fetches:
1. `GET /works/{olid}.json` — title, description, subjects, covers, first_publish_date
2. `GET /authors/{authorKey}.json` — name of the first listed author
3. `GET /works/{olid}/editions.json?limit=1` — page count from `entries[0].number_of_pages`

All requests include a `User-Agent: BookBingo/1.0 (zach.smith33@gmail.com)` header to stay within the 3 req/sec authenticated rate limit.

---

## Search UX Design

The user-facing flow for adding a reading:

1. **User types a title or author** into a search bar
2. **Internal library search first** — query `/books/` in Firestore for `externalIds.openLibrary` matches against already-known Work OLIDs. If the club has already read this work, surface the existing record immediately. Note: Firestore does not support fuzzy text search, so internal search matches by exact Work OLID, not free text.
3. **External search fallback** — if no internal match, call `enrichBook({ action: 'search', query })` to search Open Library. Display Work-level results (title, author, first publish year, cover).
4. **User selects a result** — app calls `enrichBook({ action: 'lookup', externalId })` to fetch full metadata
5. **`getOrCreateBook()` runs** — checks `externalIds.openLibrary` for an existing book, creates a new one if absent
6. **`createReading()` runs** — Firestore rule enforces that the referenced `bookId` exists

---

## Required Metadata for Manual Entry

When a user manually adds a book, the UI collects the following fields. The `metadata` object is always written; fields the user cannot provide are written as `null` or `[]`.

| Field           | Type             | Notes                                        |
| --------------- | ---------------- | -------------------------------------------- |
| `pageCount`     | `number \| null` | May be null; informs tiles like "1000+ pages" |
| `publishedDate` | `string \| null` | Optional                                     |
| `categories`    | `string[]`       | Optional, defaults to `[]`                   |
| `language`      | `string \| null` | Optional                                     |
| `isbn`          | `string \| null` | Optional; can help with identification       |
| `thumbnailUrl`  | `string \| null` | Optional                                     |

---

## Security Rules

Current state (already applied):

```
match /books/{bookId} {
  allow read, list: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  // delete intentionally omitted — books are referenced by readings
}

match /users/{userId} {
  allow read, list: if request.auth != null;
  allow create, update: if request.auth != null && request.auth.uid == userId;

  match /readings/{readingId} {
    allow read, list: if request.auth != null;
    allow create: if request.auth != null
      && request.auth.uid == userId
      && exists(/databases/$(database)/documents/books/$(request.resource.data.bookId));
    allow update, delete: if request.auth != null && request.auth.uid == userId;
  }
}

match /{path=**}/readings/{readingId} {
  allow read, list: if request.auth != null;
}
```

The `exists()` check on reading creates enforces referential integrity at the database layer. Any authenticated member may update book metadata (for enrichment).

---

## Implementation Steps

### Step 1 — Update `lib/types/src/index.ts`

Add `BookProvider` and `ExternalBookIds` before `BookMetadata`. Update the `Book` interface: `metadata` becomes required (remove `?`), replace `externalId?: string | null` with `externalIds?: ExternalBookIds`.

### Step 2 — Run typecheck to surface broken call sites

```sh
pnpm run typecheck
```

### Step 3 — Rewrite `getOrCreateBook()` in `app/web/src/lib/books.ts`

New signature:
```ts
export async function getOrCreateBook(
  title: string,
  author: string,
  userId: string,
  metadata: BookMetadata,
  externalIds?: ExternalBookIds,
): Promise<string>
```

> **⚠️ Superseded 2026-06-19** — the query-based dedup logic below is replaced by deterministic-ID dedup. `getOrCreateBook` should compute `deriveBookId(...)` (from `lib/core`) and do an idempotent `setDoc`/`getDoc` on that ID — no query. See `docs/decisions/book-identity-and-deduplication.md`.

~~Deduplication logic: if `externalIds.openLibrary` is present, query `where('externalIds.openLibrary', '==', externalIds.openLibrary)`. If a match exists, return its ID. Otherwise create a new book document with `metadata` and `externalIds` (no `titleLower`/`authorLower`).~~

Updated import from `@bookbingo/lib-types`:
```ts
import { Book, BookMetadata, ExternalBookIds } from '@bookbingo/lib-types';
```

### Step 4 — Update `app/web/src/hooks/useBooks.test.ts`

Replace the snapshot fixture in the `'maps Firestore snapshot docs to booksById Map'` test. Remove `titleLower`/`authorLower`; add a `metadata` object:

```ts
{
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  metadata: {
    pageCount: null,
    publishedDate: null,
    categories: [],
    language: null,
    isbn: null,
    thumbnailUrl: null,
  },
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01'),
}
```

### Step 5 — Update `app/web/src/lib/books.int.test.ts`

Add `import type { BookMetadata } from '@bookbingo/lib-types'`. Define a `testMetadata` fixture at the top of the describe block. Update every `getOrCreateBook` call to pass `testMetadata` as the fourth argument. Replace the `titleLower`/`authorLower` assertions with:

```ts
expect(bookData.metadata).toEqual(testMetadata);
expect(bookData.titleLower).toBeUndefined();
expect(bookData.authorLower).toBeUndefined();
```

### Step 6 — Create `functions/src/books/providers/open-library.ts`

Implement the `BookProvider` interface. See provider design above.

### Step 7 — Update `functions/src/books/handler.ts`

Wire `OpenLibraryProvider` into the handler.

### Step 8 — Run full verification

```sh
pnpm run verify
```

---

## Migration Plan

### Phase A: Enrich existing books (interactive CLI)

**Script:** `scripts/enrich-books.ts`

For each book in `/books/` that has no `externalIds.openLibrary`:

1. Search Open Library by `title` and `author`
2. Print top results (title, author, first publish year, Work OLID)
3. Prompt: select a numbered result, skip, or abort
4. On selection: write `externalIds.openLibrary` and `metadata` to the book document
5. Log each decision to stdout

### Phase B: Clean up legacy fields

After enrichment, a separate pass removes `titleLower`, `authorLower`, and the old singular `externalId` field from all book documents using `FieldValue.delete()`. Once clean, remove the composite index on `(titleLower, authorLower)` from `firestore.indexes.json` and deploy.

---

## Open Library API Reference

Rate limit: 1 req/sec unauthenticated; 3 req/sec with `User-Agent` header.

| Endpoint | Use |
| -------- | --- |
| `GET /search.json?q={query}&fields=key,title,author_name,first_publish_year,cover_i` | Book search (returns Work-level records) |
| `GET /works/{olid}.json` | Full Work metadata |
| `GET /works/{olid}/editions.json?limit=1` | Page count from first edition |
| `GET /authors/{olid}.json` | Author name |
| `GET https://covers.openlibrary.org/b/id/{cover_id}-M.jpg` | Cover image (medium) |
