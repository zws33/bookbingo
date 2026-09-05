import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
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

// Fail loudly on an incomplete config rather than shipping a bundle that
// looks fine and dies at runtime. Vite inlines a missing `import.meta.env.X`
// as `undefined`, and `initializeApp` accepts that without complaint — so a
// build with no env at all used to succeed and produce a dead app. That is
// not hypothetical: the first CI staging deploy built cleanly with all seven
// values empty, and only a missing service account stopped it from
// overwriting staging.
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

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
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  log.debug('firebase', 'connected to local emulators');
}

export { analytics };
