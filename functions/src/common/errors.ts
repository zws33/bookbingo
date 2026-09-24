export type DomainErrorKind =
  | 'invalid-input'
  | 'not-found'
  | 'conflict'
  | 'forbidden'
  | 'corrupt';

/**
 * `invalid-input`, `not-found`, `conflict` and `forbidden` messages are
 * caller-facing and forwarded verbatim. `corrupt` messages name internal state
 * and must not be. `details` is for the failure log only.
 *
 * `forbidden` says the caller may not perform the action, never whether the
 * target exists: a non-member asking for a challenge gets `not-found`, so the
 * two kinds are not interchangeable.
 */
export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly details: Record<string, unknown>;

  constructor(
    kind: DomainErrorKind,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.kind = kind;
    this.details = details;
  }
}
