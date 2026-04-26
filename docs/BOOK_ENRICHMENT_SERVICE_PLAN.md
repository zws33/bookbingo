# Book Enrichment Service Implementation Plan

This document outlines the strategy for implementing a provider-agnostic book enrichment service using Firebase Cloud Functions. The service will fetch metadata (e.g., page count, genres, thumbnails) from external APIs and map them to our internal `@bookbingo/lib-types` domain models.

## Architecture Goal

The implementation must encapsulate external API details (Google Books, Open Library, etc.) within the Cloud Function layer. The public API of the service should return standard `@bookbingo` types, ensuring that the application remains decoupled from specific third-party providers.

### Key Components

- **`BookProvider` Interface**: A TypeScript interface defining the contract for any external book API (search, lookup by ID).
- **Concrete Providers**: Implementation classes (e.g., `GoogleBooksProvider`) that handle API-specific authentication, fetching, and error handling.
- **Mapping Layer**: A transformation utility that converts provider-specific JSON into the standard `BookMetadata` interface.
- **Enrichment Service**: A core logic layer that orchestrates providers, handling fallbacks or result merging.

---

## Implementation Steps

### 1. Define Internal Interfaces & Service
- Create `functions/src/books/types.ts`: Define the `BookProvider` interface.
- Create `functions/src/books/service.ts`: Implement the `BookEnrichmentService` which accepts a `BookProvider` as a dependency.

### 2. Implement First Concrete Provider (Google Books)
- Create `functions/src/books/providers/google-books.ts`: Implement the `BookProvider` interface using the Google Books API.
- Implement the mapping logic to transform Google Books' `volume` schema into `BookMetadata`.

### 3. Create Cloud Function Handler
- Create `functions/src/books/handler.ts`: Implement the `enrichBookHandler` using `firebase-functions/v2/https`.
- Add robust input validation (ISBN format, title/author constraints).
- Map internal service errors to standard `HttpsError` codes (e.g., `not-found`, `unavailable`).

### 4. Register and Export Function
- Update `functions/src/index.ts`: Define and export the `enrichBook` Callable Function.
- Use `defineSecret` for any API keys required by providers.

### 5. Testing & Validation
- Create `functions/src/books/handler.test.ts`: Integration tests for the handler using `node:test`.
- Unit tests for the mapping layer with sample JSON payloads to ensure field-level accuracy.

---

## Verification Strategy

- **Type Integrity**: Ensure the function's return type strictly matches the `BookMetadata` interface defined in `lib/types/src/index.ts`.
- **Error Mapping**: Verify that API failures (404, 429, 500) are correctly translated into user-friendly `HttpsError` responses without leaking sensitive upstream details.
- **Mocking**: Use `node:test` mocking to simulate various API responses and edge cases (e.g., missing thumbnails, partial metadata).

## Risks & Trade-offs

- **Provider Variation**: Different APIs return varying levels of detail. The `BookProvider` interface must be generic enough to support the "lowest common denominator" while allowing for optional enrichment.
- **Rate Limiting**: Implementation should consider the impact of provider-side rate limits on user experience.
