/**
 * Seed a real Firebase project (staging) with reproducible, non-trivial data:
 * shared books, multiple personas, readings, and TBR lists — matching the
 * CURRENT production write shapes (see docs/STAGING_DATA.md and the data model).
 *
 * The app is Google-sign-in only, so this writes Firestore docs only (no Auth):
 * seeded data is visible to anyone via the world-readable leaderboard / community
 * library. To populate YOUR personal dashboard, pass --claim so the densest
 * persona's data is written under your staging uid.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-staging.ts [--project <id>] [--wipe] [--dry-run]
 *                                         [--claim <email> | --claim-uid <uid>]
 *
 * Examples:
 *   pnpm exec tsx scripts/seed-staging.ts --dry-run
 *   pnpm exec tsx scripts/seed-staging.ts --wipe --claim me@example.com
 */

import {
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import {
  parseFlag,
  hasFlag,
  initApp,
  guardWriteTarget,
  wipeCollections,
  resolveClaimUid,
  STAGING_PROJECT_ID,
} from './lib/admin.js';
import { BOOKS, USERS, bookIdFor, type SeedUser } from './lib/dataset.js';

const PROJECT_ID = parseFlag('project') ?? STAGING_PROJECT_ID;
const DRY_RUN = hasFlag('dry-run');
const WIPE = hasFlag('wipe');

guardWriteTarget(PROJECT_ID);
const { db, auth } = initApp(PROJECT_ID);

const BATCH_LIMIT = 500;
const booksByHandle = new Map(BOOKS.map((b) => [b.handle, b] as const));

function daysAgo(n: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Timestamp.fromDate(d);
}

/** The densest persona (most readings) — the one re-keyed to the operator. */
function densestUser(): SeedUser {
  return USERS.reduce((a, b) =>
    b.readings.length > a.readings.length ? b : a,
  );
}

/** Commit {ref,data} writes in chunks under the Firestore batch limit. */
async function commitWrites(
  db: Firestore,
  writes: { ref: DocumentReference; data: DocumentData }[],
): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + BATCH_LIMIT)) {
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

async function main(): Promise<void> {
  console.log(`Seeding staging data into project: ${PROJECT_ID}`);
  if (DRY_RUN) console.log('MODE: DRY RUN (no data will be written)');

  const claimUid = await resolveClaimUid(auth, {
    email: parseFlag('claim'),
    uid: parseFlag('claim-uid'),
  });
  const claimed = claimUid ? densestUser() : null;
  if (claimUid) {
    console.log(
      `Re-keying persona "${claimed!.name}" (${claimed!.readings.length} readings) -> ${claimUid}`,
    );
  }

  /** The uid this persona's data is actually written under. */
  const effectiveUid = (u: SeedUser): string =>
    claimed && u.uid === claimed.uid ? claimUid! : u.uid;

  if (WIPE && !DRY_RUN) {
    console.log('Wiping /users and /books first...');
    await wipeCollections(db, ['users', 'books']);
  } else if (WIPE) {
    console.log('[DRY-RUN] would wipe /users and /books');
  }

  // --- Books: dedupe referenced handles to deterministic /books/{id} docs. ---
  const referenced = new Set<string>();
  for (const u of USERS) {
    for (const r of u.readings) referenced.add(r.book);
    for (const t of u.tbr) referenced.add(t.book);
  }

  // createdBy = effective uid of the first persona (in USERS order) to reference it.
  const creatorOf = (handle: string): string => {
    for (const u of USERS) {
      if (
        u.readings.some((r) => r.book === handle) ||
        u.tbr.some((t) => t.book === handle)
      ) {
        return effectiveUid(u);
      }
    }
    return effectiveUid(USERS[0]);
  };

  const bookWrites: { ref: DocumentReference; data: DocumentData }[] = [];
  for (const handle of referenced) {
    const book = booksByHandle.get(handle);
    if (!book) throw new Error(`Unknown book handle referenced: ${handle}`);
    const id = bookIdFor(book);
    const data: DocumentData = {
      title: book.title,
      author: book.author,
      createdBy: creatorOf(handle),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (book.openLibraryKey) {
      data.externalIds = {
        openLibrary: {
          key: book.openLibraryKey,
          enrichedAt: FieldValue.serverTimestamp(),
        },
      };
    }
    if (book.metadata) data.metadata = book.metadata;
    bookWrites.push({ ref: db.collection('books').doc(id), data });
  }

  // --- Users: profile + readings + tbr, under each persona's effective uid. ---
  const userWrites: { ref: DocumentReference; data: DocumentData }[] = [];
  let readingCount = 0;
  let tbrCount = 0;

  for (const u of USERS) {
    const uid = effectiveUid(u);
    const userRef = db.collection('users').doc(uid);
    userWrites.push({
      ref: userRef,
      data: {
        name: u.name,
        photoURL: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    for (const r of u.readings) {
      const bookId = bookIdFor(booksByHandle.get(r.book)!);
      userWrites.push({
        ref: userRef.collection('readings').doc(bookId), // bookId as id == idempotent
        data: {
          bookId,
          tiles: r.tiles,
          isFreebie: r.isFreebie ?? false,
          readAt: daysAgo(r.daysAgo),
          createdAt: daysAgo(r.daysAgo),
        },
      });
      readingCount++;
    }

    for (const t of u.tbr) {
      const bookId = bookIdFor(booksByHandle.get(t.book)!);
      const data: DocumentData = {
        bookId,
        plannedTiles: t.plannedTiles ?? [],
        addedAt: daysAgo(t.daysAgo),
      };
      if (t.notes) data.notes = t.notes;
      userWrites.push({ ref: userRef.collection('tbr').doc(bookId), data });
      tbrCount++;
    }
  }

  console.log('\nSummary:');
  console.log(`- Books (deduped):  ${bookWrites.length}`);
  console.log(`- Users:            ${USERS.length}`);
  console.log(`- Readings:         ${readingCount}`);
  console.log(`- TBR entries:      ${tbrCount}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] sample book ids:');
    for (const b of BOOKS.slice(0, 4)) {
      console.log(`  ${b.handle} -> ${bookIdFor(b)}`);
    }
    return;
  }

  await commitWrites(db, bookWrites);
  await commitWrites(db, userWrites);
  console.log(
    '\nDone. Sign into staging to inspect; the leaderboard shows all personas.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
