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
      '**/.tsbuild/**',
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
        projectService: true,
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
    // are the half nothing else catches — they come from the DOM type library
    // rather than a package, and the root typecheck program puts lib/ sources
    // and lib.dom.d.ts together, so `document.title` type-checks clean.
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
