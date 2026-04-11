import { useMemo, useState } from 'react';
import { TILES, getTileById } from '@bookbingo/lib-core';
import type { Reading, Book } from '../types';
import { BoardCell } from './BoardCell';
import { Modal } from './Modal';

interface BingoBoardProps {
  readings: Reading[];
  booksById: Map<string, Book>;
}

const UNKNOWN_BOOK = { title: 'Unknown Book', author: 'Unknown Author' };

export function BingoBoard({ readings, booksById }: BingoBoardProps) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  const tileReadingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const reading of readings) {
      for (const tileId of reading.tiles) {
        map.set(tileId, (map.get(tileId) ?? 0) + 1);
      }
    }
    return map;
  }, [readings]);

  const selectedTile = selectedTileId ? getTileById(selectedTileId) : null;
  const selectedBooks = useMemo(() => {
    if (!selectedTileId) return [];
    return readings.filter((r) => r.tiles.includes(selectedTileId));
  }, [readings, selectedTileId]);

  return (
    <>
      <div className="grid grid-cols-5 gap-1 sm:gap-2 max-w-2xl mx-auto p-1 sm:p-2 bg-gray-100 rounded-lg shadow-inner">
        {TILES.map((tile) => (
          <BoardCell
            key={tile.id}
            tileName={tile.name}
            bookCount={tileReadingCounts.get(tile.id) ?? 0}
            onClick={() => setSelectedTileId(tile.id)}
          />
        ))}
      </div>

      <Modal
        isOpen={selectedTileId !== null}
        onClose={() => setSelectedTileId(null)}
        title={selectedTile?.name ?? ''}
      >
        {selectedBooks.length === 0 ? (
          <p className="text-gray-500">No books tagged with this tile yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selectedBooks.map((reading) => {
              const book = booksById.get(reading.bookId) ?? {
                title: reading.bookTitle ?? UNKNOWN_BOOK.title,
                author: reading.bookAuthor ?? UNKNOWN_BOOK.author,
              };
              return (
                <li key={reading.id} className="py-2">
                  <div className="font-medium text-gray-900">{book.title}</div>
                  <div className="text-sm text-gray-500">{book.author}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
