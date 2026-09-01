import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      'functions/lib/**',
      '.gemini/**',
      '**/*.d.ts',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        // `projectService` discovers only files literally named tsconfig.json
        // by walking up from each linted file. app/web/tsconfig.node.json
        // covers vite.config.ts and vitest.config.int.ts for `tsc`, but isn't
        // auto-discovered under that name — list them explicitly so lint
        // doesn't silently drop coverage for the two.
        projectService: {
          allowDefaultProject: [
            'app/web/vite.config.ts',
            'app/web/vitest.config.int.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    // React hooks live only in the web app; lib/ and functions/ are framework-agnostic.
    files: ['app/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Enforces the lib/ boundary CLAUDE.md calls a first-class architectural
    // concern. lib/core is consumed by the browser, by Node scripts, and (per
    // docs/decisions/guarded-writes.md) soon by Cloud Functions, so anything
    // environment-specific in here breaks at runtime in at least one of them.
    //
    // Anchored at the repo root, so this matches lib/{core,types,util}/ and
    // NOT app/web/src/lib/, which is app-internal and unrelated.
    //
    // pnpm's isolated node_modules already makes most of these imports fail to
    // resolve; the rule states the intent and gives a better error. The globals
    // are defence in depth: lib/**'s tsconfig extends @bookbingo/tsconfig/node,
    // which excludes DOM types, so `document.title` already fails to compile —
    // this rule catches the same misuse for editors/tools that skip typecheck.
    files: ['lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-*'],
              message:
                'lib/ is framework-agnostic — keep React in app/web/. See CLAUDE.md "Architecture Guidance".',
            },
            {
              group: [
                'firebase',
                'firebase/*',
                'firebase-admin',
                'firebase-admin/*',
                'firebase-functions',
                'firebase-functions/*',
              ],
              message:
                'lib/ must not depend on Firebase — it runs in the browser, in Node scripts, and in Cloud Functions. Keep SDK calls in the consumer.',
            },
            {
              group: ['@bookbingo/web'],
              message:
                'Dependency direction is app/web -> lib, never the reverse.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message:
            'lib/ must not touch browser globals — it also runs in Node. Pass what you need in as an argument.',
        },
        {
          name: 'document',
          message:
            'lib/ must not touch browser globals — it also runs in Node. Pass what you need in as an argument.',
        },
        {
          name: 'localStorage',
          message:
            'lib/ must not touch browser globals — it also runs in Node.',
        },
        {
          name: 'sessionStorage',
          message:
            'lib/ must not touch browser globals — it also runs in Node.',
        },
        {
          name: 'navigator',
          message:
            'lib/ must not touch browser globals — it also runs in Node.',
        },
      ],
    },
  },
);
