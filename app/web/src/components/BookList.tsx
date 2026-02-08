import { useState, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { Reading } from '../types';
import { BookCard } from './BookCard';
import { EmptyState } from './EmptyState';
import { SearchFilter } from './SearchFilter';

interface BookListProps {
  user: User;
}

export function BookList({ user }: BookListProps) {
  const [authorFilter, setAuthorFilter] = useState('');
  const [snapshot, loading, error] = useCollection(
    collection(db, 'users', user.uid, 'readings')
  );

  const readings: Reading[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Reading[];
  }, [snapshot]);

  const filteredReadings = useMemo(() => {
    if (!authorFilter.trim()) return readings;
    const filter = authorFilter.toLowerCase();
    return readings.filter((r) =>
      r.bookAuthor.toLowerCase().includes(filter)
    );
  }, [readings, authorFilter]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading books...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      {readings.length > 0 && (
        <SearchFilter value={authorFilter} onChange={setAuthorFilter} />
      )}

      {filteredReadings.length === 0 ? (
        readings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="text-center py-8 text-gray-500">
            No books match your filter.
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredReadings.map((reading) => (
            <BookCard key={reading.id} reading={reading} />
          ))}
        </div>
      )}
    </div>
  );
}