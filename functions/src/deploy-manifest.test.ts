import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * `functions/` is the one package in this repo that is deployed as a standalone
 * directory. `firebase deploy` uploads it alone — no workspace root, no
 * pnpm-lock.yaml — and Google's Node buildpack installs it with **npm**.
 *
 * npm cannot parse pnpm's `workspace:` protocol. It fails while reading the
 * manifest, before it resolves anything, so the specifier is fatal in *any*
 * dependency section — including devDependencies:
 *
 *     npm error code EUNSUPPORTEDPROTOCOL
 *     npm error Unsupported URL Type "workspace:": workspace:*
 *
 * Build-time-only workspace types belong in `paths` in functions/tsconfig.json,
 * not in this manifest. See the comment there.
 *
 * This guard is deliberately scoped to functions/. Every other package is
 * either bundled by Vite or never leaves the monorepo, so `workspace:*` is
 * correct for them.
 */

const MANIFEST_URL = new URL('../package.json', import.meta.url);

// One level under functions/ from both src/ (tsx) and lib/ (compiled).
const manifest = JSON.parse(readFileSync(MANIFEST_URL, 'utf8')) as Record<
  string,
  Record<string, string> | undefined
>;

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/** Protocols npm's package-arg parser rejects outright. */
const UNPARSEABLE_BY_NPM = ['workspace:', 'catalog:'];

describe('functions/package.json is installable by npm', () => {
  for (const section of DEPENDENCY_SECTIONS) {
    it(`has no npm-hostile specifier in ${section}`, () => {
      const offenders = Object.entries(manifest[section] ?? {}).filter(
        ([, specifier]) =>
          UNPARSEABLE_BY_NPM.some((protocol) => specifier.startsWith(protocol)),
      );

      assert.deepEqual(
        offenders,
        [],
        `${section} contains specifiers npm cannot parse: ${offenders
          .map(([name, specifier]) => `${name}@${specifier}`)
          .join(', ')}. ` +
          'Cloud Build installs this directory with npm and will fail with ' +
          'EUNSUPPORTEDPROTOCOL. Move build-time-only packages to the "paths" ' +
          'alias in functions/tsconfig.json instead.',
      );
    });
  }

  it('declares a Node runtime Cloud Functions actually offers', () => {
    // Cloud Functions ships nodejs20 and nodejs22 only. Declaring 24 made both
    // the emulator and every deploy reject the codebase for six weeks.
    assert.ok(
      ['20', '22'].includes(
        (manifest.engines as unknown as Record<string, string>)?.node,
      ),
      'engines.node must be "20" or "22" — no other runtime exists.',
    );
  });
});
