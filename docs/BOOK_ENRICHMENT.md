# Book Enrichment & Tile Optimization

This project transforms the manual book entry experience into a search-driven, metadata-enriched system with automated tile suggestions and optimization.

## 1. Vision & Goals

The transition from manual entry to an enriched model solves four core problems:

1. **Deduplication**: Books now have a shared identity in a global `/books/` collection rather than being denormalized strings.
2. **Metadata**: Each book stores structured data (ISBN, page count, categories, thumbnails) shared across all users.
3. **Reduced Friction**: Search-driven entry (via Google Books API) replaces manual typing.
4. **Tile Optimization**: Automated suggestions and an optimization engine help users maximize their scores.

## 2. Architecture

### Backend: Enrichment Service

A provider-agnostic Cloud Function (`enrichBook`) encapsulates external API logic.

- **`BookProvider` Interface**: Defines the contract for external APIs (Search/Lookup).
- **Concrete Providers**: Implementations like `GoogleBooksProvider` handle API-specific fetching and mapping to internal types.
- **Mapping Layer**: Transforms provider-specific JSON into the standard `BookMetadata` interface.
- **Service Layer**: Orchestrates providers and handles internal business logic.

### Frontend: Integration

- **`bookSearch.ts`**: A thin client-side wrapper that invokes the Cloud Function.
- **`useBooks` Hook**: Provides an O(1) lookup map of all shared books for efficient client-side joins with user readings.

## 3. Data Model

### Shared Books (`/books/{bookId}`)

```ts
interface Book {
  id: string;
  title: string;
  author: string;
  externalId: string | null; // API provider ID (e.g., Google Books ID)
  metadata: {
    pageCount: number | null;
    publishedDate: string | null;
    categories: string[]; // Genre tags from API
    language: string | null;
    isbn: string | null;
    thumbnailUrl: string | null;
  };
  createdBy: string;
  createdAt: timestamp;
}
```

### User Readings (`/users/{userId}/readings/{readingId}`)

```ts
interface Reading {
  id: string;
  bookId: string; // Reference to /books/
  tiles: string[]; // Currently active bingo tiles
  isFreebie: boolean;
  readAt: timestamp;
}
```

## 4. Roadmap & Status

| Phase       | Description                           | Status      |
| :---------- | :------------------------------------ | :---------- |
| **Phase 1** | **Enriched Model & Migration**        | ✅ Complete |
| **Phase 2** | **Community Library** (`/library`)    | 🏗️ Partial  |
| **Phase 3** | **Search & Prefill** (Cloud Function) | 🚀 Active   |
| **Phase 4** | **Tile Optimization Engine**          | 💤 Pending  |

---

## 5. Feature Specifications

### Community Library (Phase 2)

A club-wide view of all read books.

- **Data Strategy**: Client-side eager join using `useBooks()` and `useAllReadings()`.
- **UI Design**: Responsive list (column-to-row) showing read counts and aggregated tile pills.
- **Pending**: Per-reader detail expansion and sort/filter toggles.

### Search & Prefill (Phase 3)

Search-driven entry flow using the Google Books API.

- **Flow**: User searches → Selects result → Metadata pre-fills form → Deduplication check via `externalId` → Link or Create `/books/` doc.
- **Tile Inference**: Suggested tiles (e.g., `t03` for 1000+ pages) are pre-selected based on `metadata.pageCount`.

### Tile Optimization (Phase 4)

Greedy algorithm to automatically assign up to 3 tiles per book to maximize a user's total score.

- **Algorithm**: Marginal gain computation across all readings (including freebie handling).
- **Interface**: `optimizeTiles(readings: Reading[]): OptimizedAssignment[]`.

## 6. Migration History (Summary)

The project successfully migrated from a denormalized model using the **Parallel Change (Expand-Migrate-Contract)** pattern:

1. **Expand**: Supported both `bookTitle`/`bookAuthor` strings and `bookId` references.
2. **Migrate**: A background script backfilled the `/books/` collection and linked existing readings.
3. **Contract**: Code now strictly uses `bookId` for all new logic. (Cleanup of legacy fields in Firestore is pending).
