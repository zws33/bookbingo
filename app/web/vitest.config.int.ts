import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup-tests.ts'],
    // ONLY include integration tests here
    include: ['src/**/*.int.test.ts'],
    // DO NOT exclude them here
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    // This suite performs real writes. Pin it to the emulator here rather
    // than relying on a gitignored .env.test to say so — `test.env` wins
    // over any .env file, so the target cannot be changed by local state,
    // and the suite runs from a fresh clone with no setup.
    //
    // These are the fake credentials the Firestore/Auth emulators accept.
    // `demo-` project ids are reserved for emulator use and can never
    // resolve to a real project; this one matches the `--project` that
    // `pnpm run test:integration` passes to `firebase emulators:exec`.
    env: {
      VITE_USE_EMULATOR: 'true',
      VITE_FIREBASE_API_KEY: 'fake-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-bookbingo.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-bookbingo',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-bookbingo.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
    },
    testTimeout: 10000,
  },
});
