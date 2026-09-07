/**
 * Integration tests for the createManualBook callable against the Functions
 * and Firestore emulators.
 *
 * Requires the Firebase emulator to be running:
 *   pnpm run emulator:start
 *
 * Run with:
 *   pnpm run test:integration
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
  type App as AdminApp,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type { BookMetadata } from '@bookbingo/lib-types';

type CreateManualBookRequest = {
  title: string;
  author: string;
  metadata: BookMetadata;
};

type CreateManualBookResponse = {
  bookId: string;
  created: boolean;
};

function makeMetadata(): BookMetadata {
  return {
    pageCount: 412,
    publishedDate: '1965',
    isbn: '9780441172719',
    language: 'en',
    thumbnailUrl: 'https://example.com/dune.jpg',
    categories: ['Science Fiction'],
  };
}

describe.sequential('createManualBook integration (emulator)', () => {
  let app: FirebaseApp;
  let adminApp: AdminApp;
  let auth: Auth;
  let db: Firestore;
  let functions: Functions;
  const createdBookIds: string[] = [];

  beforeAll(() => {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

    app = initializeApp(
      {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
      'create-manual-book-int',
    );

    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);

    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);

    adminApp = initializeAdminApp(
      { projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID },
      'create-manual-book-int-admin',
    );
  });

  afterEach(async () => {
    await Promise.all(
      createdBookIds.map((id) =>
        getAdminFirestore(adminApp).doc(`books/${id}`).delete(),
      ),
    );
    createdBookIds.length = 0;

    if (auth.currentUser) {
      await signOut(auth);
    }
  });

  afterAll(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }

    await deleteApp(app);
    await deleteAdminApp(adminApp);
  });

  function createManualBookCallable() {
    return httpsCallable<CreateManualBookRequest, CreateManualBookResponse>(
      functions,
      'createManualBook',
    );
  }

  it('rejects unauthenticated callers', async () => {
    await expect(
      createManualBookCallable()({
        title: 'Dune',
        author: 'Frank Herbert',
        metadata: makeMetadata(),
      }),
    ).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  });

  it('rejects invalid manual book payloads', async () => {
    await signInAnonymously(auth);

    await expect(
      createManualBookCallable()({
        title: '   ',
        author: 'Frank Herbert',
        metadata: makeMetadata(),
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('creates a manual book document from the callable payload', async () => {
    await signInAnonymously(auth);

    const response = await createManualBookCallable()({
      title: '  The Left Hand of Darkness  ',
      author: '  Ursula K. Le Guin  ',
      metadata: {
        pageCount: 304,
        publishedDate: ' 1969 ',
        isbn: ' 9780441478125 ',
        language: ' en ',
        thumbnailUrl: 'https://example.com/left-hand.jpg',
        categories: [' Science Fiction ', ' Classics '],
      },
    });

    expect(response.data.created).toBe(true);
    expect(response.data.bookId).toMatch(/\S+/);
    createdBookIds.push(response.data.bookId);

    const snap = await getDoc(doc(db, 'books', response.data.bookId));
    expect(snap.exists()).toBe(true);
    expect(snap.data()).toMatchObject({
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      metadata: {
        pageCount: 304,
        publishedDate: '1969',
        isbn: '9780441478125',
        language: 'en',
        thumbnailUrl: 'https://example.com/left-hand.jpg',
        categories: ['Science Fiction', 'Classics'],
      },
    });
  });
});
