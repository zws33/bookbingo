/**
 * Mirror a snapshot of prod into staging via a programmatic Admin-SDK copy.
 *
 * Reads the SOURCE (prod) read-only and writes the DEST (staging, guarded so it
 * can never be prod). Books are copied verbatim (deterministic ids, no PII).
 * User profile names are anonymized by default. One persona's readings/TBR are
 * re-keyed to YOUR staging uid so your personal dashboard is populated.
 *
 * The app is Google-only, so Auth is intentionally NOT mirrored (prod uids
 * wouldn't match a staging Google login). See docs/STAGING_DATA.md.
 *
 * Usage:
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts [--from <id>] [--to <id>]
 *        [--wipe] [--no-anonymize] [--dry-run] [--claim <email> | --claim-uid <uid>]
 *
 * Examples:
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts --dry-run
 *   pnpm exec tsx scripts/mirror-prod-to-staging.ts --wipe --claim me@example.com
 */

import {
  FieldValue,
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
  PROD_PROJECT_ID,
  STAGING_PROJECT_ID,
} from './lib/admin.js';

const FROM = parseFlag('from') ?? PROD_PROJECT_ID;
const TO = parseFlag('to') ?? STAGING_PROJECT_ID;
const DRY_RUN = hasFlag('dry-run');
const WIPE = hasFlag('wipe');
const ANONYMIZE = !hasFlag('no-anonymize');

guardWriteTarget(TO); // FROM may be prod (read-only); TO may not.
const src = initApp(FROM, 'source');
const dst = initApp(TO, 'dest');

const BATCH_LIMIT = 500;

interface SourceUser {
  uid: string;
  profile: DocumentData;
  readings: { id: string; data: DocumentData }[];
  tbr: { id: string; data: DocumentData }[];
}

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

async function readSourceUsers(): Promise<SourceUser[]> {
  const usersSnap = await src.db.collection('users').get();
  const users: SourceUser[] = [];
  for (const userDoc of usersSnap.docs) {
    const [readingsSnap, tbrSnap] = await Promise.all([
      userDoc.ref.collection('readings').get(),
      userDoc.ref.collection('tbr').get(),
    ]);
    users.push({
      uid: userDoc.id,
      profile: userDoc.data(),
      readings: readingsSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
      tbr: tbrSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    });
  }
  return users;
}

async function main(): Promise<void> {
  console.log(`Mirror: ${FROM} (read-only)  ->  ${TO}`);
  console.log(`Anonymize names: ${ANONYMIZE} | Dry run: ${DRY_RUN}`);

  const claimUid = await resolveClaimUid(dst.auth, {
    email: parseFlag('claim'),
    uid: parseFlag('claim-uid'),
  });

  const booksSnap = await src.db.collection('books').get();
  const users = await readSourceUsers();

  // Re-key the prod user with the most readings onto the operator's staging uid.
  const claimSource = claimUid
    ? users.reduce(
        (a, b) => (b.readings.length > a.readings.length ? b : a),
        users[0],
      )
    : null;
  if (claimSource) {
    console.log(
      `Re-keying source user ${claimSource.uid} (${claimSource.readings.length} readings) -> ${claimUid}`,
    );
  }

  if (WIPE && !DRY_RUN) {
    console.log('Wiping dest /users and /books first...');
    await wipeCollections(dst.db, ['users', 'books']);
  } else if (WIPE) {
    console.log('[DRY-RUN] would wipe dest /users and /books');
  }

  // --- Books: verbatim copy (same deterministic ids, no PII). ---
  const bookWrites = booksSnap.docs.map((d) => ({
    ref: dst.db.collection('books').doc(d.id),
    data: d.data(),
  }));

  // --- Users: anonymized profile + readings + tbr, re-keying the claimed one. ---
  const userWrites: { ref: DocumentReference; data: DocumentData }[] = [];
  let readingCount = 0;
  let tbrCount = 0;
  let anonIndex = 0;

  for (const u of users) {
    const isClaimed = claimSource !== null && u.uid === claimSource.uid;
    const destUid = isClaimed ? claimUid! : u.uid;
    const userRef = dst.db.collection('users').doc(destUid);

    // Don't overwrite the operator's own (real) staging profile when claiming.
    if (!isClaimed) {
      userWrites.push({
        ref: userRef,
        data: ANONYMIZE
          ? {
              name: `Reader ${++anonIndex}`,
              photoURL: null,
              updatedAt: FieldValue.serverTimestamp(),
            }
          : u.profile,
      });
    }

    for (const r of u.readings) {
      userWrites.push({
        ref: userRef.collection('readings').doc(r.id),
        data: r.data,
      });
      readingCount++;
    }
    for (const t of u.tbr) {
      userWrites.push({
        ref: userRef.collection('tbr').doc(t.id),
        data: t.data,
      });
      tbrCount++;
    }
  }

  console.log('\nSummary:');
  console.log(`- Books copied:     ${bookWrites.length}`);
  console.log(`- Source users:     ${users.length}`);
  console.log(`- Readings copied:  ${readingCount}`);
  console.log(`- TBR copied:       ${tbrCount}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] no writes performed.');
    return;
  }

  await commitWrites(dst.db, bookWrites);
  await commitWrites(dst.db, userWrites);
  console.log('\nDone. Staging now mirrors the prod snapshot.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Mirror failed:', err);
    process.exit(1);
  });
