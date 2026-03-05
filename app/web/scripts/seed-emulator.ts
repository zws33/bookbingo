/**
 * Seed script for the Firebase emulator.
 *
 * Usage:
 *   pnpm --filter @bookbingo/web emulator:seed
 *
 * Requires emulators to be running:
 *   pnpm --filter @bookbingo/web emulator:start
 *
 * Idempotent — skips seeding if test users already exist.
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// These env vars are set by the emulator:seed npm script
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error(
    'FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must be set.\n' +
    'Run via: pnpm --filter @bookbingo/web emulator:seed',
  );
  process.exit(1);
}

initializeApp({ projectId: 'demo-bookbingo' });

const auth = getAuth();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Test user definitions
// ---------------------------------------------------------------------------

interface SeedUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
  password: string
}

const USERS: SeedUser[] = [
  {
    uid: 'seed-user-alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    photoURL: 'http://localhost:5173/avatar.jpg',
    emailVerified: true,
    password: 'password123',
  },
  {
    uid: 'seed-user-bob',
    email: 'bob@example.com',
    displayName: 'Bob',
    photoURL: 'http://localhost:5173/avatar.jpg',
    emailVerified: true,
    password: 'password123',
  },
];

// ---------------------------------------------------------------------------
// Seed readings per user — diverse tiles to exercise the scoring engine
// ---------------------------------------------------------------------------

interface SeedReading {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const ALICE_READINGS: SeedReading[] = [
  {
    bookId: 'book-piranesi',
    bookTitle: 'Piranesi',
    bookAuthor: 'Susanna Clarke',
    tiles: ['t39', 't25'], // unreliable narrator, genre classic
    isFreebie: false,
    readAt: daysAgo(60),
    createdAt: daysAgo(60),
  },
  {
    bookId: 'book-annihilation',
    bookTitle: 'Annihilation',
    bookAuthor: 'Jeff VanderMeer',
    tiles: ['t39', 't26'], // unreliable narrator (repeat), multiple POVs
    isFreebie: false,
    readAt: daysAgo(45),
    createdAt: daysAgo(45),
  },
  {
    bookId: 'book-lolita',
    bookTitle: 'Lolita',
    bookAuthor: 'Vladimir Nabokov',
    tiles: ['t11', 't24', 't39'], // translated, socially taboo, unreliable narrator
    isFreebie: false,
    readAt: daysAgo(30),
    createdAt: daysAgo(30),
  },
  {
    bookId: 'book-homegoing',
    bookTitle: 'Homegoing',
    bookAuthor: 'Yaa Gyasi',
    tiles: ['t26', 't22'], // multiple POVs, american history
    isFreebie: false,
    readAt: daysAgo(14),
    createdAt: daysAgo(14),
  },
  {
    bookId: 'book-maus',
    bookTitle: 'Maus',
    bookAuthor: 'Art Spiegelman',
    tiles: ['t05', 't18'], // graphic novel, banned book
    isFreebie: false,
    readAt: daysAgo(5),
    createdAt: daysAgo(5),
  },
];

const BOB_READINGS: SeedReading[] = [
  {
    bookId: 'book-worm',
    bookTitle: 'Worm',
    bookAuthor: 'Wildbow',
    tiles: ['t03', 't02'], // 1000+ pages, part of a series
    isFreebie: false,
    readAt: daysAgo(90),
    createdAt: daysAgo(90),
  },
  {
    bookId: 'book-beckett-waiting',
    bookTitle: 'Waiting for Godot',
    bookAuthor: 'Samuel Beckett',
    tiles: ['t04', 't33'], // under 100 pages, shakespeare play (theatrical classic)
    isFreebie: false,
    readAt: daysAgo(50),
    createdAt: daysAgo(50),
  },
  {
    bookId: 'book-lathe-heaven',
    bookTitle: 'The Lathe of Heaven',
    bookAuthor: 'Ursula K. Le Guin',
    tiles: ['t43', 't27'], // time travel, well-behaved women
    isFreebie: false,
    readAt: daysAgo(35),
    createdAt: daysAgo(35),
  },
  {
    bookId: 'book-tinker-tailor',
    bookTitle: 'Tinker, Tailor, Soldier, Spy',
    bookAuthor: 'John le Carré',
    tiles: ['t41', 't31'], // espionage, adapted to other medium
    isFreebie: false,
    readAt: daysAgo(20),
    createdAt: daysAgo(20),
  },
  {
    bookId: 'book-hobbit',
    bookTitle: 'The Hobbit',
    bookAuthor: 'J.R.R. Tolkien',
    tiles: ['t02', 't25', 't31'], // part of series (repeat), genre classic, adapted
    isFreebie: false,
    readAt: daysAgo(7),
    createdAt: daysAgo(7),
  },
];

// ---------------------------------------------------------------------------
// Seeding logic
// ---------------------------------------------------------------------------

function toTimestamp(d: Date): Timestamp {
  return Timestamp.fromDate(d);
}

async function seedUser(user: SeedUser, readings: SeedReading[]): Promise<void> {
  // Idempotency check — skip only if both Auth user and Firestore doc exist.
  // Checking Auth alone causes Firestore writes to be skipped if the emulator
  // was restarted after Auth was seeded but before Firestore data was exported.
  const userRef = db.collection('users').doc(user.uid);
  const firestoreDoc = await userRef.get();

  let authExists = false;
  try {
    await auth.getUser(user.uid);
    authExists = true;
  } catch {
    // Auth user doesn't exist — will create
  }

  if (authExists && firestoreDoc.exists) {
    console.log(`  [skip] ${user.displayName} already fully seeded`);
    return;
  }

  if (!authExists) {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      password: user.password,
    });
  }

  await userRef.set({
    id: user.uid,
    name: user.displayName,
    email: user.email,
    createdAt: toTimestamp(new Date()),
  });

  const batch = db.batch();
  for (const reading of readings) {
    const readingRef = userRef.collection('readings').doc(reading.bookId);
    batch.set(readingRef, {
      id: reading.bookId,
      bookId: reading.bookId,
      bookTitle: reading.bookTitle,
      bookAuthor: reading.bookAuthor,
      tiles: reading.tiles,
      isFreebie: reading.isFreebie,
      readAt: toTimestamp(reading.readAt),
      createdAt: toTimestamp(reading.createdAt),
    });
  }
  await batch.commit();

  console.log(`  [ok]   ${user.displayName} — ${readings.length} readings seeded`);
}

async function main(): Promise<void> {
  console.log('Seeding emulator...\n');
  await seedUser(USERS[0], ALICE_READINGS);
  await seedUser(USERS[1], BOB_READINGS);
  console.log('\nDone. Open http://localhost:4000 to inspect the data.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
