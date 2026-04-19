import { useMemo } from 'react';
import { useBooks } from '../hooks/useBooks';

export function LibraryPage() {
  const { booksById, loading, error } = useBooks();

  const books = useMemo(
    () => [...booksById.values()].sort((a, b) => a.title.localeCompare(b.title)),
    [booksById],
  );

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">Error: {error.message}</div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No books in the library yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Author</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {books.map((book) => (
            <tr key={book.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">{book.title}</td>
              <td className="px-4 py-3 text-gray-600">{book.author}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
