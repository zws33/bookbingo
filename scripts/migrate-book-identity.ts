/**
 * Book Identity Migration: re-key /books/ to deterministic document IDs.
 *
 * Bridges the legacy book schema (random doc IDs, singular `externalId`,
 * `titleLower`/`authorLower`) to the deterministic-ID model
 * (see docs/decisions/book-identity-and-deduplication.md):
 *
 *   1. For each /books/{oldId}, compute its deterministic id via the SAME
 *      `deriveBookId` the app uses (imported from @bookbingo/lib-core — no
 *      hand-duplicated normalization).
 *   2. Collapse docs that share a derived id into one canonical /books/{newId}
 *      (prefer the OL-bearing doc's metadata, keep the earliest createdAt,
 *      carry the external reference as the new `externalIds` map).
 *   3. Re-point every reference — `users/*\/readings/*.bookId` AND
 *      `users/*\/tbr/*.bookId` — from old id to new id.
 *
 * Two-pass and reversible: the default run does NOT delete old docs. Once refs
 * are re-pointed, stale old docs have zero readings and are hidden by the
 * LibraryPage `readCount === 0` filter. Run again with --cleanup to delete them.
 *
 * Idempotent and resumable: re-running computes the same ids (it reads the OL
 * key from either the legacy `externalId` or the migrated `externalIds`), so
 * already-migrated docs are no-ops.
 *
 * MIGRATION-FIRST: run this against an environment BEFORE deploying the
 * deterministic `getOrCreateBook`. Deploying first opens a window where adding
 * an existing (legacy-id) book mints a fresh duplicate.
 *
 * Usage:
 *   tsx scripts/migrate-book-identity.ts --project <project-id> [--dry-run]
 *   tsx scripts/migrate-book-identity.ts --project <project-id> --cleanup [--dry-run]
 *
 * Examples:
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging --dry-run
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging
 *   tsx scripts/migrate-book-identity.ts --project bookbingo-staging --cleanup --dry-run
 */

import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { deriveBookId } from '@bookbingo/lib-core';

const args = process.argv.slice(2);
const projectFlagIndex = args.indexOf('--project');
if (projectFlagIndex === -1 || !args[projectFlagIndex + 1]) {
  console.error('Error: --project <project-id> is required.');
  console.error(
    '  Example: tsx scripts/migrate-book-identity.ts --project bookbingo-staging --dry-run',
  );
  process.exit(1);
}
const PROJECT_ID = args[projectFlagIndex + 1];
const DRY_RUN = args.includes('--dry-run');
const CLEANUP = args.includes('--cleanup');

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('Note: FIRESTORE_EMULATOR_HOST is set — connecting to local emulator.');
}

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const BATCH_LIMIT = 500;

/** The Open Library Work key for a book doc, from either schema (legacy or migrated). */
function olKeyOf(data: DocumentData): string | null {
  return data.externalId ?? data.externalIds?.openLibrary?.key ?? null;
}

/** The deterministic id a book doc should live at, given its content. */
function targetIdOf(data: DocumentData): string {
  return deriveBookId({
    openLibraryKey: olKeyOf(data),
    title: data.title ?? '',
    author: data.author ?? '',
  });
}

function millis(data: DocumentData): number {
  const ts = data.createdAt;
  return ts instanceof Timestamp ? ts.toMillis() : Number.MAX_SAFE_INTEGER;
}

/**
 * Re-point a collectionGroup's `bookId` field according to the remap, in batches.
 * Returns the number of documents updated.
 */
async function repointCollectionGroup(
  db: Firestore,
  group: string,
  remap: Map<string, string>,
): Promise<number> {
  const snap = await db.collectionGroup(group).get();
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const newId = remap.get(doc.get('bookId'));
    if (!newId) continue;

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] ${group}: ${doc.ref.path} -> bookId ${newId}`);
    } else {
      batch.update(doc.ref, { bookId: newId });
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    updated++;
  }

  if (!DRY_RUN && ops > 0) await batch.commit();
  return updated;
}

async function runRekey() {
  console.log('Book Identity Migration: re-key /books/ to deterministic IDs');
  console.log(`Project: ${PROJECT_ID}`);
  if (DRY_RUN) console.log('MODE: DRY RUN (no data will be changed)\n');

  const booksSnap = await db.collection('books').get();
  console.log(`Found ${booksSnap.size} book docs.`);

  // Group existing docs by their target deterministic id.
  const groups = new Map<string, QueryDocumentSnapshot[]>();
  for (const doc of booksSnap.docs) {
    const newId = targetIdOf(doc.data());
    const list = groups.get(newId) ?? [];
    list.push(doc);
    groups.set(newId, list);
  }

  const remap = new Map<string, string>(); // oldId -> newId (only where they differ)
  let collapsed = 0;
  let writeBatch = db.batch();
  let ops = 0;

  for (const [newId, docs] of groups) {
    // Earliest createdAt wins provenance; OL-bearing doc wins canonical fields.
    docs.sort((a, b) => millis(a.data()) - millis(b.data()));
    const earliest = docs[0].data();
    const olDoc = docs.find((d) => olKeyOf(d.data()) !== null)?.data();
    const canonical = olDoc ?? earliest;

    const newDoc: DocumentData = {
      title: canonical.title ?? '',
      author: canonical.author ?? '',
      createdBy: earliest.createdBy ?? 'system-migration',
      createdAt: earliest.createdAt ?? FieldValue.serverTimestamp(),
    };

    const metadata = olDoc?.metadata ?? docs.map((d) => d.data().metadata).find(Boolean);
    if (metadata) newDoc.metadata = metadata;

    const olKey = olDoc ? olKeyOf(olDoc) : null;
    if (olKey) {
      const enrichedAt =
        olDoc?.externalIds?.openLibrary?.enrichedAt ??
        olDoc?.createdAt ??
        FieldValue.serverTimestamp();
      newDoc.externalIds = { openLibrary: { key: olKey, enrichedAt } };
    }

    if (docs.length > 1) {
      collapsed += docs.length - 1;
      console.log(
        `  Collapsing ${docs.length} docs -> ${newId} ("${newDoc.title}" by ${newDoc.author})`,
      );
    }

    if (DRY_RUN) {
      for (const d of docs) {
        if (d.id !== newId) console.log(`    [DRY-RUN] ${d.id} -> ${newId}`);
      }
    } else {
      // set() (no merge) writes the clean new schema, dropping legacy
      // titleLower/authorLower/externalId from the canonical doc.
      writeBatch.set(db.collection('books').doc(newId), newDoc);
      ops++;
      if (ops >= BATCH_LIMIT) {
        await writeBatch.commit();
        writeBatch = db.batch();
        ops = 0;
      }
    }

    for (const d of docs) {
      if (d.id !== newId) remap.set(d.id, newId);
    }
  }

  if (!DRY_RUN && ops > 0) await writeBatch.commit();

  console.log(`\nRe-pointing references for ${remap.size} re-keyed book id(s)...`);
  const readingsUpdated = await repointCollectionGroup(db, 'readings', remap);
  const tbrUpdated = await repointCollectionGroup(db, 'tbr', remap);

  console.log('\nMigration Summary:');
  console.log(`- Book docs scanned:        ${booksSnap.size}`);
  console.log(`- Canonical books written:  ${groups.size}`);
  console.log(`- Docs collapsed (merged):  ${collapsed}`);
  console.log(`- Book ids re-keyed:        ${remap.size}`);
  console.log(`- Readings re-pointed:      ${readingsUpdated}`);
  console.log(`- TBR entries re-pointed:   ${tbrUpdated}`);
  if (!DRY_RUN && remap.size > 0) {
    console.log(
      '\nStale old book docs are left in place (hidden by the readCount===0 filter).',
    );
    console.log('After verifying, run again with --cleanup to delete them.');
  }
}

async function runCleanup() {
  console.log('Book Identity Migration: CLEANUP stale book docs');
  console.log(`Project: ${PROJECT_ID}`);
  if (DRY_RUN) console.log('MODE: DRY RUN (no data will be changed)\n');

  // A doc is stale if it does not live at its own derived id. Delete only stale
  // docs that nothing references — refs should already be re-pointed away.
  const referenced = new Set<string>();
  for (const group of ['readings', 'tbr']) {
    const snap = await db.collectionGroup(group).get();
    for (const doc of snap.docs) {
      const bookId = doc.get('bookId');
      if (bookId) referenced.add(bookId);
    }
  }

  const booksSnap = await db.collection('books').get();
  let deleted = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of booksSnap.docs) {
    const isStale = doc.id !== targetIdOf(doc.data());
    if (!isStale) continue;

    if (referenced.has(doc.id)) {
      console.warn(`  [SKIP] stale doc ${doc.id} is still referenced — not deleting.`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would delete stale doc ${doc.id}`);
    } else {
      batch.delete(doc.ref);
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    deleted++;
  }

  if (!DRY_RUN && ops > 0) await batch.commit();

  console.log('\nCleanup Summary:');
  console.log(`- Stale docs deleted:           ${deleted}`);
  console.log(`- Stale-but-referenced skipped: ${skipped}`);
}

(CLEANUP ? runCleanup() : runRekey())
  .then(() => console.log('\nFinished.'))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
