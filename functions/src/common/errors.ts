export type DomainErrorKind =
  | 'invalid-input'
  | 'not-found'
  | 'conflict'
  | 'corrupt';

/**
 * `invalid-input`, `not-found` and `conflict` messages are caller-facing and
 * forwarded verbatim. `corrupt` messages name internal state and must not be.
 * `details` is for the failure log only.
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
