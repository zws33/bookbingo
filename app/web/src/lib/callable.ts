import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type z from 'zod/v4';
import { log } from '@bookbingo/lib-util';
import { functions } from './firebase';

/**
 * The callable's error code, e.g. `functions/unavailable`. This is the field
 * that pairs a client-side failure with the event the function logged for the
 * same request, so log it on every failure.
 */
export function errorCode(error: unknown): string {
  const code = (error as Partial<FunctionsError> | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

/**
 * Binds a callable to its response schema.
 *
 * The response is validated at this boundary rather than trusted: the client
 * and the function are deployed separately, so a stale bundle can meet a newer
 * response shape. Parsing here means that surfaces as one failed call instead
 * of an undefined field somewhere in a component.
 */
export function createCallable<Req, Res>(
  name: string,
  schema: z.ZodType<Res>,
): (data: Req) => Promise<Res> {
  const call = httpsCallable(functions, name);

  return async (data: Req): Promise<Res> => {
    try {
      const result = await call(data);
      return schema.parse(result.data);
    } catch (error) {
      log.error(name, error);
      log.event('callable_error', { name, code: errorCode(error) });
      throw error;
    }
  };
}
