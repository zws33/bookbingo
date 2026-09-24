/**
 * Proves the security rules deny the client SDK outright.
 *
 * Every other suite reaches Firestore through a callable (Admin SDK, rules
 * bypassed) or through the Admin SDK directly. This one is the exception that
 * checks the premise all of them rest on: that a signed-in browser client can
 * neither read nor write a document.
 *
 * Run with: pnpm run test:integration.
 */
/* eslint-disable no-restricted-imports -- the rule bans firebase/firestore in
   app code; this test exists to prove that ban is enforced by the server too. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  adminDb,
  closeAdminApp,
  deleteDocs,
  seedBook,
  signInTestUser,
  signOutTestUser,
} from '../testing/int';

let app: FirebaseApp;
let db: Firestore;
let userId: string;

beforeAll(async () => {
  // The app's firebase module creates no Firestore handle, so this suite builds
  // a throwaway one to attempt the denied access with.
  app = initializeApp(
    {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    },
    'rules-int',
  );
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  userId = await signInTestUser();
  await seedBook('book-rules-1');
});

afterAll(async () => {
  await deleteDocs(['books/book-rules-1']);
  await signOutTestUser();
  await closeAdminApp();
  await deleteApp(app);
});

describe.sequential('security rules (emulator)', () => {
  it('denies reading a book that exists', async () => {
    await expect(
      getDoc(doc(db, 'books', 'book-rules-1')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies listing the books collection', async () => {
    await expect(getDocs(collection(db, 'books'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('denies writing a book', async () => {
    await expect(
      setDoc(doc(db, 'books', 'book-rules-2'), { title: 'Forged' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  // The caller is signed in and this is their own path: ownership no longer
  // grants anything, because the client is not a writer at all.
  it('denies writing the caller own reading', async () => {
    await expect(
      setDoc(doc(db, 'users', userId, 'readings', 'forged'), {
        bookId: 'book-rules-1',
        tiles: [],
        isFreebie: false,
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies reading another user profile', async () => {
    await expect(
      getDoc(doc(db, 'users', 'someone-else')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('still lets the Admin SDK through, which is how the callables work', async () => {
    const snapshot = await adminDb().doc('books/book-rules-1').get();
    expect(snapshot.exists).toBe(true);
  });
});
