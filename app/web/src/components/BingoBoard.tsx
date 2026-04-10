import { useState, useMemo } from 'react';
import { TILES } from '@bookbingo/lib-core';
import { Reading, Book } from '../types';
import { BoardCell } from './BoardCell';
import { Modal } from './Modal';

interface BingoBoardProps {
  readings: Reading[];
  booksById: Map<string, Book>;
}

const UNKNOWN_BOOK = { title: 'Unknown Book', author: 'Unknown Author' };

export function BingoBoard({ readings, booksById }: BingoBoardProps) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  const tileReadings = useMemo(() => {
    const map = new Map<string, Reading[]>();
    for (const reading of readings) {
      for (const tileId of reading.tiles) {
        const list = map.get(tileId);
        if (list) {
          list.push(reading);
        } else {
          map.set(tileId, [reading]);
        }
      }
    }
    return map;
  }, [readings]);

  const selectedTile = TILES.find((t) => t.id === selectedTileId);
  const selectedBooks = selectedTileId ? tileReadings.get(selectedTileId) ?? [] : [];

  return (
    <>
      <div className="overflow-x-auto p-1">
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-1">
          {TILES.map((tile) => (
            <BoardCell
              key={tile.id}
              tileName={tile.name}
              bookCount={tileReadings.get(tile.id)?.length ?? 0}
              onClick={() => setSelectedTileId(tile.id)}
            />
          ))}
        </div>
      </div>

      <Modal
        isOpen={selectedTile !== undefined}
        onClose={() => setSelectedTileId(null)}
        title={selectedTile?.name ?? ''}
      >
        {selectedBooks.length === 0 ? (
          <p className="text-gray-500">No books tagged with this tile yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selectedBooks.map((reading) => {
              const book = booksById.get(reading.bookId) ?? UNKNOWN_BOOK;
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
