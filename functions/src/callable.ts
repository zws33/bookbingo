import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';

type AuthData = NonNullable<CallableRequest<unknown>['auth']>;

/**
 * The caller's verified auth, or `unauthenticated`.
 *
 * Every endpoint derives the acting user from the token rather than from the
 * payload: a client-supplied userId is a claim, not an identity, and once the
 * security rules deny direct access this is the only thing standing between a
 * caller and someone else's documents.
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
 *
 * The prettified issue list is safe to return: these schemas describe the
 * request shape the client already knows, so it leaks nothing a caller did not
 * send. Failures reading stored documents are the opposite case and stay in
 * Cloud Logging — see `mapValid` in schemas.ts.
 */
export function parseRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
  }
  return parsed.data;
}
