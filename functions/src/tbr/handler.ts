import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure, reportWriteFailure } from '../observability.js';
import {
  CreateTBRRequestSchema,
  DeleteTBRRequestSchema,
  PromoteTBRRequestSchema,
  UpdateTBRRequestSchema,
} from './schema.js';
import {
  tbrEntryRepository,
  type PromotionOutcome,
  type TBREntryRepository,
} from './store.js';
import { toTBREntryDTO, type TBREntryDTO } from './present.js';
import { validateReadingTiles, validateTileIds } from '../readings/validate.js';
import { attachBooks } from '../books/join.js';
import { MissingBookError } from '../books/store.js';

/**
 * The caller's own TBR list, newest first.
 *
 * Unlike readings, a TBR list is private — there is no userId parameter, so
 * there is no way to ask for someone else's.
 */
export async function listMyTBRHandler(
  request: CallableRequest<unknown>,
  tbrRepo: TBREntryRepository = tbrEntryRepository(),
): Promise<TBREntryDTO[]> {
  const { uid } = requireAuth(request, 'load your reading list');

  const entries = await tbrRepo.list(uid);

  try {
    return (await attachBooks(entries)).map(toTBREntryDTO);
  } catch (error) {
    if (error instanceof MissingBookError) {
      logFailure('tbr.list', error, {
        uid,
        outcome: 'error',
        stage: 'join',
        bookIds: error.bookIds,
      });
    }
    throw error;
  }
}

export async function createTBREntryHandler(
  request: CallableRequest<unknown>,
  tbrRepo: TBREntryRepository = tbrEntryRepository(),
): Promise<{ tbrId: string }> {
  const { uid } = requireAuth(request, 'add to your reading list');
  const { bookId, plannedTiles, notes } = parseRequest(
    CreateTBRRequestSchema,
    request.data,
  );
  // A plan is not a reading, so the cap does not apply — but the tiles still
  // have to be real ones, or promoting the entry would fail later.
  validateTileIds(plannedTiles);

  let tbrId: string;
  try {
    tbrId = await tbrRepo.create(uid, { bookId, plannedTiles, notes });
  } catch (error) {
    reportWriteFailure(error, 'tbr.create', { uid, bookId });
  }

  logEvent('tbr.create', { uid, outcome: 'ok', tbrId, bookId });
  return { tbrId };
}

export async function updateTBREntryHandler(
  request: CallableRequest<unknown>,
  tbrRepo: TBREntryRepository = tbrEntryRepository(),
): Promise<void> {
  const { uid } = requireAuth(request, 'update your reading list');
  const { tbrId, plannedTiles, notes } = parseRequest(
    UpdateTBRRequestSchema,
    request.data,
  );
  validateTileIds(plannedTiles);

  try {
    await tbrRepo.update(uid, tbrId, { plannedTiles, notes });
  } catch (error) {
    reportWriteFailure(error, 'tbr.update', { uid, tbrId });
  }

  logEvent('tbr.update', { uid, outcome: 'ok', tbrId });
}

export async function deleteTBREntryHandler(
  request: CallableRequest<unknown>,
  tbrRepo: TBREntryRepository = tbrEntryRepository(),
): Promise<void> {
  const { uid } = requireAuth(request, 'update your reading list');
  const { tbrId } = parseRequest(DeleteTBRRequestSchema, request.data);

  try {
    await tbrRepo.remove(uid, tbrId);
  } catch (error) {
    reportWriteFailure(error, 'tbr.delete', { uid, tbrId });
  }

  logEvent('tbr.delete', { uid, outcome: 'ok', tbrId });
}

export async function promoteTBREntryHandler(
  request: CallableRequest<unknown>,
  tbrRepo: TBREntryRepository = tbrEntryRepository(),
): Promise<{ readingId: string }> {
  const { uid } = requireAuth(request, 'log a reading');
  const { tbrId, tiles, isFreebie } = parseRequest(
    PromoteTBRRequestSchema,
    request.data,
  );
  validateReadingTiles(tiles, isFreebie);

  let outcome: PromotionOutcome;
  try {
    outcome = await tbrRepo.promote(uid, tbrId, tiles, isFreebie);
  } catch (error) {
    reportWriteFailure(error, 'tbr.promote', { uid, tbrId });
  }

  logEvent('tbr.promote', {
    uid,
    outcome: outcome.alreadyLogged ? 'already-logged' : 'ok',
    tbrId,
    readingId: outcome.readingId,
    bookId: outcome.bookId,
    tileCount: tiles.length,
    isFreebie,
  });
  return { readingId: outcome.readingId };
}
