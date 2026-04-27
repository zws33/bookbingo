# Book Data Model Architecture

This document describes the target data model for books and readings in BookBingo, along with the deduplication strategy, required metadata contract, security rule changes, and migration plan.

---

## Goals

1. **Books as source of truth.** The `/books/` collection is the canonical registry of all book entities. A `Reading` must always reference a valid `Book`. Referential integrity is enforced at the database layer, not in application code.

2. **Multi-provider external IDs.** A `Book` may be linked to one or more external catalog providers (e.g., Google Books, Open Library). Each provider's ID is tracked independently. A single canonical `metadata` blob lives on the `Book` document.

3. **Metadata is required.** All book entities — whether created through API-driven search or manual entry — must carry a `metadata` object. Individual fields within the object may be null, but the object itself must always be present.

4. **Remove `titleLower` / `authorLower`.** These write-time normalization fields were used for case-insensitive deduplication queries. They are superseded by `externalId`-based dedup for API-sourced books. Manual-entry books accept rare duplication as a known trade-off. These fields will be cleaned up from all existing documents via migration.

5. **Enrich existing books.** An interactive migration script will walk through every book in `/books/` that lacks external metadata and prompt for a Google Books match. Enrichment is approved manually, one book at a time.

---

## Target Data Model

### `BookProvider`

```ts
// lib/types/src/index.ts
type BookProvider = 'googleBooks' | 'openLibrary';
```

A union type enumerating all supported external catalog providers. Extending to a new provider requires: (1) adding the value to this union, (2) adding a field-level Firestore index for the new `externalIds.<provider>` path.

### `ExternalBookIds`

```ts
// lib/types/src/index.ts
type ExternalBookIds = Partial<Record<BookProvider, string>>;
```

A map from provider to that provider's ID for a given book. Each key is optional — a book may have one, several, or no external IDs (manual entries).

### `Book` (updated)

```ts
interface Book {
  id: string;
  title: string;
  author: string;
  metadata: BookMetadata;         // now required (was optional)
  externalIds?: ExternalBookIds;  // replaces externalId?: string | null
  createdBy: string;
  createdAt: Date;
}
```

Removed fields (legacy, cleaned up by migration):
- `externalId?: string | null` — superseded by `externalIds`
- `titleLower` and `authorLower` — superseded by `externalIds`-based dedup

### `BookMetadata` (shape unchanged)

```ts
interface BookMetadata {
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
}
```

The shape is unchanged. The requirement is that the `metadata` object is always present on a `Book`, not that individual fields are non-null.

### `Reading` (unchanged)

The `Reading` shape is unchanged. The `bookTitle?` and `bookAuthor?` legacy fields remain in the TypeScript type pending a future cleanup commit. New readings must always carry a valid `bookId`.

---

## Deduplication Strategy

### API-sourced books (primary path)

When a user selects a book from search results:

1. Query `/books/` where `externalIds.<provider> == selectedExternalId`
2. If a match exists → return the existing `bookId` (optionally merge any richer metadata)
3. If no match → create a new `Book` with `externalIds`, `metadata`, and `metadataSource` populated

### Manual-entry books (fallback path)

Manual entry is reserved for obscure books that return no usable API results. The entry flow creates a new `Book` with user-supplied `metadata` and no `externalIds`. No deduplication is performed. Duplication risk for truly obscure books is accepted.

**Implication for `titleLower`/`authorLower`:** these fields are no longer written for new books and will be removed from existing documents by the cleanup migration. The composite Firestore index on those fields will be dropped after cleanup.

---

## Required Metadata for Manual Entry

When a user manually adds a book, the UI must collect the following. The `metadata` object is always written; fields that the user cannot provide are written as `null` or `[]`.

| Field | Type | Notes |
|---|---|---|
| `pageCount` | `number \| null` | Drives tile inference (e.g., 1000+ page tile); required as a field, may be null |
| `publishedDate` | `string \| null` | Optional |
| `categories` | `string[]` | Optional, defaults to `[]` |
| `language` | `string \| null` | Optional |
| `isbn` | `string \| null` | Optional |
| `thumbnailUrl` | `string \| null` | Optional |

`pageCount` is surfaced explicitly in the UI because it is the only metadata field that affects scoring (via tile inference). The rest are informational.

---

## Security Rules Changes

### 1. Referential integrity on Reading creates

Add an `exists()` check so the database layer enforces that a `Reading` cannot be created without a valid `Book`:

```
match /readings/{readingId} {
  allow create: if request.auth.uid == userId
    && exists(/databases/$(database)/documents/books/$(request.resource.data.bookId));
  allow update, delete: if request.auth.uid == userId;
  allow read, list: if request.auth != null;
}
```

### 2. Book updates: any authenticated user

The current update rule restricts writes to the original creator. This blocks:
- A second user enriching a shared book they found via search
- The enrichment migration script updating `externalIds` and `metadata`

Updated rule:

```
match /books/{bookId} {
  allow read, list: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
}
```

Books are a shared club resource. Any authenticated member may enrich or correct book metadata. The `createdBy` field is retained for attribution; enforcement is no longer tied to it.

---

## Migration Plan

### Phase A: Enrich existing books (interactive CLI)

**Script:** `scripts/enrich-books.ts`

For each book in `/books/` that has no `externalIds.googleBooks`:

1. Search Google Books by the book's `title` and `author`
2. Print the top results in the terminal (title, author, published date, Google Books ID)
3. Prompt: select a numbered result, skip, or abort
4. On selection: write `externalIds.googleBooks` and `metadata` to the book document
5. Log each decision (selected / skipped) to stdout for review

Usage:
```sh
# Dry run against emulator (no writes)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 tsx scripts/enrich-books.ts --project bookbingo-demo --dry-run

# Live run against staging
tsx scripts/enrich-books.ts --project bookbingo-staging
```

### Phase B: Clean up legacy fields

After enrichment, a separate pass removes `titleLower`, `authorLower`, and the old singular `externalId` field from all book documents using `FieldValue.delete()`. Once the data is clean, remove the composite index on `(titleLower, authorLower)` from `firestore.indexes.json` and deploy.

---

## Development: Testing the Cloud Function Locally

The `enrichBook` callable function can be tested against the local emulator via `firebase functions:shell`, which provides a mocked auth context and bypasses the `unauthenticated` guard in `enrichBookHandler`:

```sh
# Terminal 1: start emulators
pnpm run emulator:start

# Terminal 2: open function shell
firebase functions:shell

# Test search action
enrichBook({ action: 'search', query: 'Dune' })

# Test lookup by Google Books volume ID
enrichBook({ action: 'lookup', externalId: 'Ude5AAAAQBAJ' })
```

For a **scriptable** alternative — useful for the enrichment migration, which calls the Google Books API directly rather than routing through the callable function — the migration script will use the admin SDK and call the provider directly. This avoids the auth requirement and keeps the migration self-contained.
