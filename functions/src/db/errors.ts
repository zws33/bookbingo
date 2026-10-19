import {
  describePgError,
  toDomainError,
  type PgErrorRules,
} from '../common/pgErrors.js';
import { DomainError } from '../common/errors.js';
import { logEvent, logFailure, type EventFields } from '../observability.js';

/**
 * How a repository failure should be recorded.
 *
 * `rejected` is a violation a rule claims — the write was refused for a reason
 * the caller is told. `failed` is everything the database raised that no rule
 * claims: an unmapped constraint, a syntax error, a dropped connection. The
 * first is an event, the second pages.
 *
 * `silent` covers a `DomainError` the repository raised itself, such as an
 * update matching no row. Nothing broke, so nothing is logged here; the handler
 * records the rejection under its own event.
 */
export type DbFailureLevel = 'rejected' | 'failed' | 'silent';

export interface DbFailure {
  level: DbFailureLevel;
  fields: EventFields;
}

/** Pure, so the classification is testable without capturing log output. */
export function classifyDbFailure(
  error: unknown,
  mapped: unknown,
  fields: EventFields,
): DbFailure {
  const pgError = describePgError(error);
  if (!pgError) return { level: 'silent', fields };

  const described: EventFields = {
    ...fields,
    sqlstate: pgError.code,
    ...(pgError.constraint !== undefined && { constraint: pgError.constraint }),
  };

  if (mapped instanceof DomainError) {
    return { level: 'rejected', fields: { ...described, kind: mapped.kind } };
  }
  return { level: 'failed', fields: described };
}

/**
 * A repository's own error channel: maps a Postgres error to the `DomainError`
 * it stands for and records it under `db.*` before the caller sees it.
 *
 * Handlers log what they were attempting and know nothing about storage; this
 * logs the SQLSTATE and constraint and knows nothing about the callable. Both
 * entries carry the request's trace, so a failure reads end to end.
 *
 * Returns the mapped error rather than throwing, because a repository may
 * choose to answer a mapped `not-found` with an empty result instead.
 */
export function dbErrors(repository: string, defaults: PgErrorRules = {}) {
  return function mapError(
    operation: string,
    error: unknown,
    overrides: PgErrorRules = {},
  ): unknown {
    const mapped = toDomainError(error, { ...defaults, ...overrides });
    const { level, fields } = classifyDbFailure(error, mapped, {
      repository,
      operation,
    });

    if (level === 'rejected') logEvent('db.rejected', fields);
    if (level === 'failed') logFailure('db.error', error, fields);

    return mapped;
  };
}
