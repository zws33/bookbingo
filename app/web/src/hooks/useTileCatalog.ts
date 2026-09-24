import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Tile } from '@bookbingo/lib-types';
import { getBoardConfig } from '../data/boardConfig';
import { queryKeys } from '../lib/queryClient';

/** Hoisted so the loading state does not hand out a new array each render. */
const NO_TILES: Tile[] = [];

/**
 * Safe to call from a leaf in a long list: every caller shares one cached
 * request. `staleTime: Infinity` because the catalog changes with a deploy.
 * While loading, `getTileById` returns undefined and callers fall back to the
 * raw id. It is memoized, so it is safe in a dependency array.
 */
export function useTileCatalog() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.boardConfig,
    queryFn: () => getBoardConfig(),
    staleTime: Infinity,
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
    loading: isPending,
    error: error ?? undefined,
  };
}
