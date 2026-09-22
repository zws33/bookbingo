import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';

type AuthData = NonNullable<CallableRequest<unknown>['auth']>;

/**
 * The caller's verified auth, or `unauthenticated`.
 *
 * Every endpoint derives the acting user from the token rather than from the
 * payload.
 *
 * Returns the whole `auth` rather than the uid so callers that need the
 * profile claims get them already narrowed to non-null.
 */
export function requireAuth(
  request: CallableRequest<unknown>,
  action: string,
): AuthData {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', `Must be signed in to ${action}.`);
  }
  return request.auth;
}

/**
 * Parses a request payload, mapping a zod failure to `invalid-argument`.
 */
export function parseRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
  }
  return parsed.data;
}
