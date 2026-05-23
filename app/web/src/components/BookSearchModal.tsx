import { useState, useEffect, useCallback } from 'react';
import { Dialog } from './ui/index.js';
import { Input } from './ui/index.js';
import { useToast } from '../lib/ToastContext';
import {
  searchBooks,
  lookupBook,
  type BookSearchResult,
  type BookEnrichmentResult,
} from '../lib/bookSearch';

interface BookSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookSelected: (data: BookEnrichmentResult | null) => void;
}

export function BookSearchModal({ isOpen, onClose, onBookSelected }: BookSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const { showError } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchBooks(query);
        setResults(data);
      } catch {
        showError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, showError]);

  const handleSelect = useCallback(
    async (result: BookSearchResult) => {
      if (isSelecting) return;
      setIsSelecting(true);
      try {
        const enriched = await lookupBook(result.externalId);
        onBookSelected(enriched);
      } catch {
        showError('Could not load book details. Please try again.');
      } finally {
        setIsSelecting(false);
      }
    },
    [isSelecting, onBookSelected, showError],
  );

  const handleManualEntry = useCallback(() => {
    onBookSelected(null);
  }, [onBookSelected]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Find a Book">
      <div className="space-y-3">
        <Input
          type="text"
          placeholder="Search by title or author..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSelecting}
          autoFocus
        />

        {isSearching && (
          <p className="text-sm text-gray-500 text-center py-2">Searching...</p>
        )}

        {!isSearching && results.length > 0 && (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md max-h-72 overflow-y-auto">
            {results.map((r) => (
              <li key={r.externalId}>
                <button
                  type="button"
                  disabled={isSelecting}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {r.thumbnailUrl ? (
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      className="w-8 h-11 object-cover rounded flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-8 h-11 bg-gray-100 rounded flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm">{r.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.author}{r.publishedDate ? ` · ${r.publishedDate}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {isSelecting && (
          <p className="text-sm text-gray-500 text-center py-2">Loading book details...</p>
        )}

        {!isSearching && !isSelecting && query.length >= 2 && results.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-2">No results found.</p>
        )}

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={handleManualEntry}
            disabled={isSelecting}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            Enter manually instead
          </button>
        </div>
      </div>
    </Dialog>
  );
}
