import { logger } from 'firebase-functions';

/**
 * Structured Cloud Logging events.
 *
 * Every event carries an `event` field holding its name, so Log Explorer
 * queries filter on `jsonPayload.event="..."` rather than matching the message
 * string. Numeric fields (`durationMs`, `status`) are what log-based metrics
 * are built from, so keep them numbers — never pre-formatted strings.
 */
export type EventFields = Record<string, unknown>;

export function logEvent(event: string, fields: EventFields = {}): void {
  logger.info(event, { event, ...fields });
}

export function logWarning(
  event: string,
  error: unknown,
  fields: EventFields = {},
): void {
  logger.warn(event, { event, ...fields, ...describeError(error) });
}

export function logFailure(
  event: string,
  error: unknown,
  fields: EventFields = {},
): void {
  logger.error(event, { event, ...fields, ...describeError(error) });
}

/**
 * Flattens an unknown throw into log fields.
 *
 * `cause` is the field that matters: `fetch` rejects with the useless message
 * "fetch failed" and hangs the real reason — a DNS failure, a connect timeout,
 * a reset socket — off `cause`, carrying the diagnostic code. Logging only
 * `error.message` is what makes an upstream outage indistinguishable from a bug.
 */
export function describeError(error: unknown): EventFields {
  if (!(error instanceof Error)) {
    return { errorName: 'NonError', errorMessage: String(error) };
  }

  const fields: EventFields = {
    errorName: error.name,
    errorMessage: error.message,
  };
  if (error.stack) fields.stack = error.stack;

  const cause: unknown = error.cause;
  if (cause instanceof Error) {
    fields.causeName = cause.name;
    fields.causeMessage = cause.message;
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string') fields.causeCode = code;
  } else if (cause !== undefined) {
    fields.causeMessage = String(cause);
  }

  return fields;
}
