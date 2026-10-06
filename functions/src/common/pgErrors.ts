import { DomainError, type DomainErrorKind } from './errors.js';

/**
 * What a violated constraint means to the caller. Keyed by constraint name
 * because the SQLSTATE alone is ambiguous: `23503` on `readings` is a missing
 * book or a missing membership depending on which foreign key failed.
 */
export type ConstraintMessages = Record<
  string,
  readonly [DomainErrorKind, string]
>;

export interface PgErrorRules {
  constraints?: ConstraintMessages;
  /**
   * Postgres rejects a non-uuid string before any row is read (`22P02`), where
   * Firestore accepted any id and simply found nothing. Without this an id the
   * client made up is a 500 rather than the `not-found` it has always been.
   */
  malformedId?: string;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
/** Distinct from 23503: raised when `on delete restrict` blocks a delete. */
const RESTRICT_VIOLATION = '23001';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const INVALID_TEXT_REPRESENTATION = '22P02';

const BY_CONSTRAINT = new Set([
  UNIQUE_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  RESTRICT_VIOLATION,
  CHECK_VIOLATION,
  NOT_NULL_VIOLATION,
]);

interface PgError {
  code: string;
  constraint?: string;
}

/**
 * Duck-typed rather than `instanceof pg.DatabaseError`: the field this reads is
 * the documented one, and a `code` that is not a SQLSTATE matches no rule and
 * falls through to the original error.
 */
function asPgError(error: unknown): PgError | undefined {
  if (error instanceof DomainError || !(error instanceof Error))
    return undefined;
  const { code, constraint } = error as Error & Partial<PgError>;
  if (typeof code !== 'string') return undefined;
  return { code, ...(typeof constraint === 'string' && { constraint }) };
}

/**
 * Returns the `DomainError` a violation stands for, or the original error when
 * no rule claims it — an unmapped violation is a bug, and a 500 naming the
 * constraint is the right way to find it.
 */
export function toDomainError(error: unknown, rules: PgErrorRules): unknown {
  const pgError = asPgError(error);
  if (!pgError) return error;

  if (pgError.code === INVALID_TEXT_REPRESENTATION) {
    return rules.malformedId
      ? new DomainError('not-found', rules.malformedId, { code: pgError.code })
      : error;
  }

  if (!BY_CONSTRAINT.has(pgError.code) || !pgError.constraint) return error;

  const declared = rules.constraints?.[pgError.constraint];
  if (!declared) return error;

  const [kind, message] = declared;
  return new DomainError(kind, message, {
    code: pgError.code,
    constraint: pgError.constraint,
  });
}
