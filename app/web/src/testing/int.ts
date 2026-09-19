import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
  type App as AdminApp,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

/**
 * Harness for the emulator integration suite.
 *
 * Tests drive the real client wrappers in `src/data`, so what runs is the same
 * code the app ships: the callable binding, the request payload and the zod
 * response schema. The Admin SDK appears only where a test has to arrange or
 * inspect stored state — seeding a book, checking a document, cleaning up —
 * because once the security rules are locked the client cannot do any of that.
 */
let adminApp: AdminApp | undefined;

export function adminDb(): Firestore {
  if (!adminApp) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    adminApp = initializeAdminApp(
      { projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID },
      `int-admin-${Math.random().toString(36).slice(2)}`,
    );
  }
  return getFirestore(adminApp);
}

/** A fresh anonymous user per call keeps each suite's writes isolated. */
export async function signInTestUser(): Promise<string> {
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function signOutTestUser(): Promise<void> {
  if (auth.currentUser) await signOut(auth);
}

export async function closeAdminApp(): Promise<void> {
  if (adminApp) {
    await deleteAdminApp(adminApp);
    adminApp = undefined;
  }
}

/** Writes a book the way the book callables would, and returns its id. */
export async function seedBook(
  id: string,
  fields: { title?: string; author?: string } = {},
): Promise<string> {
  await adminDb()
    .doc(`books/${id}`)
    .set({
      title: fields.title ?? 'Dune',
      author: fields.author ?? 'Frank Herbert',
      metadata: {
        pageCount: 412,
        publishedDate: '1965',
        categories: ['Science Fiction'],
        language: 'en',
        isbn: null,
        thumbnailUrl: null,
      },
    });
  return id;
}

/** Removes every document a suite created, ignoring ones already gone. */
export async function deleteDocs(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => adminDb().doc(path).delete()));
}
