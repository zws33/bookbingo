import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

/** `measurementId` is deliberately absent — analytics is optional. */
const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

/**
 * Refuse to build a bundle with no Firebase config.
 *
 * A top-level throw in firebase.ts is not enough on its own: Rollup bundles
 * that module without executing it, so the error only surfaces in the browser
 * — after the broken bundle has already been deployed. The first real CI
 * staging deploy built cleanly with all seven values empty; only a missing
 * service account stopped it from replacing a working staging site.
 *
 * `apply: 'build'` scopes this to the deploy path. Vitest runs through this
 * config in `serve` mode and supplies its own env, and blocking `dev` on a
 * missing file is a worse trade than the runtime error firebase.ts still
 * throws.
 */
function requireFirebaseEnv(): Plugin {
  return {
    name: 'bookbingo:require-firebase-env',
    apply: 'build',
    config(_config, { mode }) {
      // Reads .env.<mode> and any VITE_-prefixed process env, so this covers
      // local builds and CI secrets alike.
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const missing = REQUIRED_FIREBASE_ENV.filter((key) => !env[key]);
      if (missing.length > 0) {
        throw new Error(
          `Refusing to build mode "${mode}" — missing Firebase config: ${missing.join(', ')}.\n` +
            'Local builds read app/web/.env.<mode>; CI reads GitHub secrets. See app/web/.env.example.',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [requireFirebaseEnv(), tailwindcss(), react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup-tests.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // tsc build output — never a source of tests
      '**/.tsbuild/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/*.int.test.*',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/testing/**', 'src/main.tsx'],
    },
  },
});
