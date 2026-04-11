/**
 * Phase 2 Migration Script: Backfill Reading bookId
 *
 * This script identifies readings that are missing a bookId (legacy data)
 * and matches them against the shared /books/ collection, creating new
 * book documents as needed.
 *
 * Usage:
 *   pnpm run migrate:readings [--dry-run]
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-bookbingo';
const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn('Warning: FIRESTORE_EMULATOR_HOST not set. Running against production if credentials exist.');
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

/**
 * Normalization logic (must match app implementation in app/web/src/lib/books.ts)
 */
function normalize(val: string): string {
  return val.trim().toLowerCase();
}

/**
 * Local cache to avoid redundant queries and creations for the same book within a single run.
 */
const bookCache = new Map<string, string>(); // normalizationKey -> bookId
let newBooksCreated = 0;

/**
 * Generates a consistent key for looking up books in the cache.
 */
function getCacheKey(title: string, author: string): string {
  return `${normalize(title)}|${normalize(author)}`;
}

async function findOrCreateBookId(title: string, author: string): Promise<string | null> {
  const key = getCacheKey(title, author);
  
  // 1. Check local cache
  if (bookCache.has(key)) {
    return bookCache.get(key)!;
  }

  // 2. Query Firestore /books/
  const titleLower = normalize(title);
  const authorLower = normalize(author);
  
  const booksRef = db.collection('books');
  const snapshot = await booksRef
    .where('titleLower', '==', titleLower)
    .where('authorLower', '==', authorLower)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const bookId = snapshot.docs[0].id;
    bookCache.set(key, bookId);
    return bookId;
  }

  // 3. Create new shared book (unless dry-run)
  if (DRY_RUN) {
    const fakeId = `new-book-id-for-${titleLower}`;
    console.log(`  [DRY-RUN] Would create book: "${title}" by ${author}`);
    bookCache.set(key, fakeId);
    return fakeId;
  }

  const newBookRef = await booksRef.add({
    title,
    author,
    titleLower,
    authorLower,
    createdBy: 'system-migration',
    createdAt: FieldValue.serverTimestamp(),
  });

  const newId = newBookRef.id;
  newBooksCreated++;
  bookCache.set(key, newId);
  return newId;
}

async function run() {
  console.log(`Starting Phase 2 Migration: Readings Backfill`);
  console.log(`Project: ${PROJECT_ID}`);
  if (DRY_RUN) console.log(`MODE: DRY RUN (no data will be changed)\n`);

  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Use collectionGroup to find ALL readings across all users
  const readingsSnapshot = await db.collectionGroup('readings').get();
  console.log(`Found ${readingsSnapshot.size} total readings across all users.`);

  let batch = db.batch();
  let opsInBatch = 0;

  for (const doc of readingsSnapshot.docs) {
    const data = doc.data();
    processedCount++;

    // Skip if bookId is already present
    if (data.bookId && !data.bookId.startsWith('new-book-id-for-')) {
      skippedCount++;
      continue;
    }

    const title = data.bookTitle;
    const author = data.bookAuthor;

    if (!title) {
      console.warn(`  [WARN] Skipping document ${doc.ref.path}: Missing bookTitle`);
      skippedCount++;
      continue;
    }

    const bookId = await findOrCreateBookId(title, author || 'Unknown Author');
    
    if (!bookId) {
      console.error(`  [ERROR] Failed to resolve bookId for "${title}"`);
      continue;
    }

    // Determine if it was a match or a creation (log purposes only)
    if (bookId.startsWith('new-book-id-for-') || !bookCache.has(getCacheKey(title, author || 'Unknown Author'))) {
       // logic slightly fuzzy for dry-run vs real but good enough for logging
    }

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would update reading ${doc.ref.path} -> bookId: ${bookId}`);
    } else {
      batch.update(doc.ref, { 
        bookId,
        updatedAt: FieldValue.serverTimestamp()
      });
      opsInBatch++;
      
      if (opsInBatch >= 500) {
        await batch.commit();
        console.log(`  [BATCH] Committed 500 updates...`);
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    updatedCount++;
  }

  // Commit remaining ops
  if (!DRY_RUN && opsInBatch > 0) {
    await batch.commit();
    console.log(`  [BATCH] Committed final ${opsInBatch} updates.`);
  }

  console.log(`\nMigration Summary:`);
  console.log(`- Total Readings Processed: ${processedCount}`);
  console.log(`- Readings Updated:         ${updatedCount}`);
  console.log(`- Readings Skipped:         ${skippedCount}`);
  console.log(`- Unique Books Processed:   ${bookCache.size}`);
  if (!DRY_RUN) {
    console.log(`- New Shared Books Created: ${newBooksCreated}`);
  }
  
  console.log(`\nFinished.`);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
