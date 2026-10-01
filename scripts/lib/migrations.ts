import { createHash } from 'node:crypto';

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
}

const FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function parseMigrationFilename(filename: string): {
  version: string;
  name: string;
} {
  const match = FILENAME.exec(filename);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Migration filename must be NNNN_lower_snake.sql, got: ${filename}`,
    );
  }
  return { version: match[1], name: match[2] };
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export function sortByVersion(files: MigrationFile[]): MigrationFile[] {
  return [...files].sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Applied migrations are rejected when their file changed, and pending ones
 * when they sort below something already applied: both mean the database and
 * the directory describe different schemas, which a later migration will
 * silently build on.
 */
export function pendingMigrations(
  files: MigrationFile[],
  applied: AppliedMigration[],
): MigrationFile[] {
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  const ordered = sortByVersion(files);

  for (const [version, row] of appliedByVersion) {
    const file = ordered.find((candidate) => candidate.version === version);
    if (!file) {
      throw new Error(
        `Migration ${version}_${row.name} is recorded as applied but its file is gone.`,
      );
    }
    if (file.checksum !== row.checksum) {
      throw new Error(
        `Migration ${version}_${file.name} changed after it was applied. ` +
          'Recreate the database, or add a new migration instead of editing this one.',
      );
    }
  }

  const pending = ordered.filter((file) => !appliedByVersion.has(file.version));
  const highestApplied = [...appliedByVersion.keys()].sort().at(-1);
  const outOfOrder =
    highestApplied === undefined
      ? undefined
      : pending.find((file) => file.version < highestApplied);
  if (outOfOrder) {
    throw new Error(
      `Migration ${outOfOrder.version}_${outOfOrder.name} sorts below the applied ${highestApplied}. ` +
        'Renumber it above the highest applied version.',
    );
  }

  return pending;
}
