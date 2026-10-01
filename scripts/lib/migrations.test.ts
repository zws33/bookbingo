import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checksumOf,
  parseMigrationFilename,
  pendingMigrations,
  type MigrationFile,
} from './migrations.js';

function file(
  version: string,
  name: string,
  sql = `-- ${version}`,
): MigrationFile {
  return { version, name, sql, checksum: checksumOf(sql) };
}

function appliedFrom(migration: MigrationFile) {
  const { version, name, checksum } = migration;
  return { version, name, checksum };
}

test('parseMigrationFilename splits version from name', () => {
  assert.deepEqual(parseMigrationFilename('0006_readings.sql'), {
    version: '0006',
    name: 'readings',
  });
});

test('parseMigrationFilename rejects an unnumbered file', () => {
  assert.throws(
    () => parseMigrationFilename('readings.sql'),
    /NNNN_lower_snake/,
  );
});

test('pending excludes what is applied and sorts the rest', () => {
  const first = file('0001', 'users');
  const pending = pendingMigrations(
    [file('0003', 'challenges'), first, file('0002', 'books')],
    [appliedFrom(first)],
  );

  assert.deepEqual(
    pending.map((migration) => migration.version),
    ['0002', '0003'],
  );
});

test('an applied migration whose file changed is rejected', () => {
  const applied = appliedFrom(file('0001', 'users', 'create table users ()'));

  assert.throws(
    () =>
      pendingMigrations(
        [file('0001', 'users', 'create table users (id text)')],
        [applied],
      ),
    /changed after it was applied/,
  );
});

test('an applied migration with no file is rejected', () => {
  assert.throws(
    () => pendingMigrations([], [appliedFrom(file('0001', 'users'))]),
    /its file is gone/,
  );
});

test('a new migration numbered below the highest applied is rejected', () => {
  const applied = file('0002', 'books');

  assert.throws(
    () =>
      pendingMigrations(
        [file('0001', 'users'), applied],
        [appliedFrom(applied)],
      ),
    /sorts below the applied 0002/,
  );
});
