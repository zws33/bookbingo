/**
 * Shared bootstrap for admin scripts that talk to a *real* Firebase project
 * (staging — and, read-only, prod) via the Admin SDK.
 *
 * Credentials (against a real project the Admin SDK needs them — pick one):
 *   - `gcloud auth application-default login`  (recommended on a laptop), or
 *   - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
 *
 * Safety: every script that WRITES must pass its destination project through
 * `guardWriteTarget` so the "never write to prod" rule lives in exactly one place.
 */

import { initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/** Project ids resolved from `.firebaserc`. Keep in sync if those change. */
export const PROD_PROJECT_ID = 'bookbingo-3fdb1';
export const STAGING_PROJECT_ID = 'bookbingo-staging';

/** Value of `--name <value>`, or undefined if absent / if followed by another flag. */
export function parseFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

/** Whether the boolean flag `--name` was passed. */
export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export interface FirebaseHandles {
  app: App;
  db: Firestore;
  auth: Auth;
}

/**
 * Initialize a (named) Admin SDK app. Named apps let one process hold two
 * project connections at once — e.g. a prod *source* and a staging *dest* for
 * the mirror. Omit `appName` for the single-project scripts.
 */
export function initApp(projectId: string, appName?: string): FirebaseHandles {
  const app = appName
    ? initializeApp({ projectId }, appName)
    : initializeApp({ projectId });
  return { app, db: getFirestore(app), auth: getAuth(app) };
}

/**
 * Exit the process if `projectId` is production. Call this for the destination
 * of any write. The mirror's *source* may be prod (read-only) and does not go
 * through here.
 */
export function guardWriteTarget(projectId: string): void {
  if (projectId === PROD_PROJECT_ID) {
    console.error(
      `Refusing to run: ${projectId} is PRODUCTION.\n` +
        'These scripts never write to prod. Target staging instead:\n' +
        `  --project ${STAGING_PROJECT_ID}`,
    );
    process.exit(1);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.warn(
      `Note: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST} is set ` +
        '— writing to the local emulator, not the cloud project.',
    );
  }
}

/**
 * Recursively delete the named top-level collections (docs + subcollections).
 * Destructive — only reachable behind a `--wipe` flag. Used to make seeding /
 * mirroring reproducible (a clean slate each run).
 */
export async function wipeCollections(
  db: Firestore,
  names: string[],
): Promise<void> {
  for (const name of names) {
    await db.recursiveDelete(db.collection(name));
    console.log(`  [wipe] cleared /${name}`);
  }
}

/**
 * Resolve the staging uid to re-key a persona's data onto, so the operator's
 * personal dashboard is populated. Accepts an explicit uid, or an email looked
 * up via Auth (requires having signed into the target project at least once,
 * since the app is Google-only and mints the uid on first sign-in).
 *
 * Returns null when no claim was requested.
 */
export async function resolveClaimUid(
  auth: Auth,
  opts: { email?: string; uid?: string },
): Promise<string | null> {
  if (opts.uid) return opts.uid;
  if (!opts.email) return null;

  try {
    const user = await auth.getUserByEmail(opts.email);
    return user.uid;
  } catch {
    console.error(
      `Could not resolve a uid for "${opts.email}" in this project.\n` +
        'Sign into the target environment once with that Google account so its\n' +
        'Auth user exists, then re-run — or pass --claim-uid <uid> directly.',
    );
    process.exit(1);
  }
}
