import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { initLogger, log } from '@bookbingo/lib-util';
import z from 'zod/v4';

const FirebaseEnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_FIREBASE_MEASUREMENT_ID: z.string().min(1).optional(),
});

// Vite inlines a missing `import.meta.env.X` as `undefined` and `initializeApp`
// accepts it, so an empty env yields a dead app rather than a build error.
// vite.config.ts blocks this at build time; this is the runtime backstop.
const env = FirebaseEnvSchema.safeParse(import.meta.env);
if (!env.success) {
  const vars = Object.keys(z.flattenError(env.error).fieldErrors).join(', ');
  throw new Error(
    `Firebase config is incomplete in mode "${import.meta.env.MODE}" — missing: ${vars}. ` +
      'Local dev reads app/web/.env.<mode>; CI reads GitHub secrets. See app/web/.env.example.',
  );
}

const firebaseConfig = {
  apiKey: env.data.VITE_FIREBASE_API_KEY,
  authDomain: env.data.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.data.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.data.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.data.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.data.VITE_FIREBASE_APP_ID,
  ...(env.data.VITE_FIREBASE_MEASUREMENT_ID !== undefined && {
    measurementId: env.data.VITE_FIREBASE_MEASUREMENT_ID,
  }),
};

/**
 * Must match `setGlobalOptions` in functions/src/index.ts. A mismatch is not a
 * build error — the SDK just calls a URL in the wrong region and every callable
 * fails with `functions/not-found` at runtime.
 */
const FUNCTIONS_REGION = 'northamerica-northeast1';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

const isEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';
const analytics =
  !isEmulator && firebaseConfig.measurementId ? getAnalytics(app) : null;

initLogger({
  isDev: import.meta.env.DEV,
  dispatch: analytics
    ? (name, params) => logEvent(analytics, name, params)
    : null,
});

log.debug('firebase', 'initializing', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
});

if (isEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  log.debug('firebase', 'connected to local emulators');
}

export { analytics };
