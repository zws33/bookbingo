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
import { type App } from 'firebase-admin/app';
import { type Firestore } from 'firebase-admin/firestore';
import { type Auth } from 'firebase-admin/auth';
/** Project ids resolved from `.firebaserc`. Keep in sync if those change. */
export declare const PROD_PROJECT_ID = "bookbingo-3fdb1";
export declare const STAGING_PROJECT_ID = "bookbingo-staging";
/** Value of `--name <value>`, or undefined if absent / if followed by another flag. */
export declare function parseFlag(name: string): string | undefined;
/** Whether the boolean flag `--name` was passed. */
export declare function hasFlag(name: string): boolean;
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
export declare function initApp(projectId: string, appName?: string): FirebaseHandles;
/**
 * Exit the process if `projectId` is production. Call this for the destination
 * of any write. The mirror's *source* may be prod (read-only) and does not go
 * through here.
 */
export declare function guardWriteTarget(projectId: string): void;
/**
 * Recursively delete the named top-level collections (docs + subcollections).
 * Destructive — only reachable behind a `--wipe` flag. Used to make seeding /
 * mirroring reproducible (a clean slate each run).
 */
export declare function wipeCollections(db: Firestore, names: string[]): Promise<void>;
/**
 * Resolve the staging uid to re-key a persona's data onto, so the operator's
 * personal dashboard is populated. Accepts an explicit uid, or an email looked
 * up via Auth (requires having signed into the target project at least once,
 * since the app is Google-only and mints the uid on first sign-in).
 *
 * Returns null when no claim was requested.
 */
export declare function resolveClaimUid(auth: Auth, opts: {
    email?: string;
    uid?: string;
}): Promise<string | null>;
//# sourceMappingURL=admin.d.ts.map