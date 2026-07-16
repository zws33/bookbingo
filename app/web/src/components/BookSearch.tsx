import { useState, useEffect, useCallback } from 'react';
import { Input } from './ui/index.js';
import { useToast } from '../lib/ToastContext.js';
import {
  searchBooks,
  lookupBook,
  type BookSearchResult,
  type BookEnrichmentResult,
} from '../lib/bookSearch.js';

interface BookSearchProps {
  onBookSelected: (data: BookEnrichmentResult) => void;
  onManualEntry: () => void;
}

export function BookSearch({ onBookSelected, onManualEntry }: BookSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const { showError } = useToast();

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
    onManualEntry();
  }, [onManualEntry]);

  return (
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
        <p className="py-2 text-center text-sm text-on-surface-variant">Searching...</p>
      )}

      {!isSearching && results.length > 0 && (
        <ul className="max-h-72 divide-y divide-outline-variant overflow-y-auto rounded-md border border-outline-variant">
          {results.map((r) => (
            <li key={r.externalId}>
              <button
                type="button"
                disabled={isSelecting}
                onClick={() => handleSelect(r)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {r.thumbnailUrl ? (
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    className="h-11 w-8 shrink-0 rounded object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        'none';
                    }}
                  />
                ) : (
                  <div className="h-11 w-8 shrink-0 rounded bg-surface-container-high" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">
                    {r.title}
                  </p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {r.author}
                    {r.publishedDate ? ` · ${r.publishedDate}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isSelecting && (
        <p className="py-2 text-center text-sm text-on-surface-variant">
          Loading book details...
        </p>
      )}

      {!isSearching &&
        !isSelecting &&
        query.length >= 2 &&
        results.length === 0 && (
          <p className="py-2 text-center text-sm text-on-surface-variant">
            No results found.
          </p>
        )}

      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={handleManualEntry}
          disabled={isSelecting}
          className="text-sm text-primary hover:text-on-primary-container disabled:opacity-50"
        >
          Enter manually instead
        </button>
      </div>
    </div>
  );
}
