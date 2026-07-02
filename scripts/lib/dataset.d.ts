/**
 * Declarative synthetic dataset for staging.
 *
 * Books are referenced by a local `handle`; their Firestore id is derived with
 * the SAME `deriveBookId` the app uses, so two personas that share a handle
 * converge to one `/books/{id}` doc — exercising dedup and the community library
 * exactly as real usage would. Tiles use real ids from `lib/core` constants
 * (`t01`–`t43`, `m01`–`m06`).
 */
import type { BookMetadata } from '@bookbingo/lib-types';
export interface SeedBook {
    handle: string;
    title: string;
    author: string;
    /** Open Library Work key, present only for "enriched" books. */
    openLibraryKey?: string;
    metadata?: BookMetadata;
}
export interface SeedReadingSpec {
    /** SeedBook.handle */
    book: string;
    tiles: string[];
    isFreebie?: boolean;
    daysAgo: number;
}
export interface SeedTbrSpec {
    /** SeedBook.handle */
    book: string;
    plannedTiles?: string[];
    notes?: string;
    daysAgo: number;
}
export interface SeedUser {
    uid: string;
    name: string;
    readings: SeedReadingSpec[];
    tbr: SeedTbrSpec[];
}
/** Deterministic `/books/{id}` for a seed book — same contract as the app. */
export declare function bookIdFor(book: SeedBook): string;
export declare const BOOKS: SeedBook[];
export declare const USERS: SeedUser[];
//# sourceMappingURL=dataset.d.ts.map