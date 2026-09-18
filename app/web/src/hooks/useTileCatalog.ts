import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Tile } from '@bookbingo/lib-types';
import { getBoardConfig } from '../data/boardConfig';
import { queryKeys } from '../lib/queryClient';

/** Hoisted so the loading state does not hand out a new array each render. */
const NO_TILES: Tile[] = [];

/**
 * The tile catalog, shared by every component that names a tile.
 *
 * Safe to call from a leaf rendered in a long list: the query cache keys on
 * `boardConfig`, so every caller shares one request and one result. It never
 * goes stale on its own — the catalog changes with a deploy, not while the
 * page is open.
 *
 * While it loads, `getTileById` returns undefined and callers fall back to the
 * raw tile id, which is what they already did for an unknown tile.
 *
 * `getTileById` is memoized on the lookup map rather than rebuilt per render,
 * so it is safe to name in a dependency array.
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
