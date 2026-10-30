import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Tile } from '@bookbingo/lib-types';
import { useChallenges } from '../challenge/ChallengeContext';
import { getBoardConfig } from '../data/boardConfig';
import { queryKeys } from '../lib/queryClient';

/** Hoisted so the loading state does not hand out a new array each render. */
const NO_TILES: Tile[] = [];

/**
 * Safe to call from a leaf in a long list: every caller shares one cached
 * request. The vocabulary is a challenge's own stored tags, which an admin can
 * change while the app is open, so it takes the default staleTime rather than
 * being cached for the session. While loading, `getTileById` returns undefined
 * and callers fall back to the raw id. It is memoized, so it is safe in a
 * dependency array.
 *
 * The challenge comes from context rather than a parameter: the four leaf
 * components that call this sit several levels below any page that knows it.
 * Outside a challenge route the query stays idle, which is how the dev-only
 * catalog page renders raw tag ids instead of throwing.
 */
export function useTileCatalog() {
  const { active } = useChallenges();
  const challengeId = active?.challenge.id ?? '';

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.boardConfig(challengeId),
    queryFn: () => getBoardConfig({ challengeId }),
    enabled: challengeId !== '',
  });

  const byId = useMemo(
    () => new Map((data?.tiles ?? NO_TILES).map((tile) => [tile.id, tile])),
    [data],
  );

  const getTileById = useCallback(
    (id: string): Tile | undefined => byId.get(id),
    [byId],
  );

  return {
    tiles: data?.tiles ?? NO_TILES,
    maxTilesPerBook: data?.maxTilesPerBook,
    getTileById,
    loading: challengeId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
