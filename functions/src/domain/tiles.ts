import type { Tile } from '@bookbingo/lib-types';
import { TILES } from './constants.js';

const tileMap = new Map<string, Tile>(TILES.map((t) => [t.id, t]));

export function getTileById(id: string): Tile | undefined {
  return tileMap.get(id);
}
