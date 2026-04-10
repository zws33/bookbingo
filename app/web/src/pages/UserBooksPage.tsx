import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getScoreBreakdown } from '@bookbingo/lib-core';
import { useReadings } from '../hooks/useReadings';
import { useBooks } from '../hooks/useBooks';
import { useUserProfile } from '../hooks/useUserProfile';
import { BookList } from '../components/BookList';
import { ScoreDisplay } from '../components/ScoreDisplay';

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? 'User';
}

export function UserBooksPage() {
  const { userId } = useParams<{ userId: string }>();
  const { profile, loading: profileLoading } = useUserProfile(userId ?? '');
  const { readings, loading: readingsLoading, error: readingsError } = useReadings(userId ?? '');
  const { booksById, loading: booksLoading, error: booksError } = useBooks();

  const loading = readingsLoading || booksLoading;
  const error = readingsError || booksError;

  const scoreBreakdown = useMemo(() => {
    if (!userId || !readings || readings.length === 0) return null;
    return getScoreBreakdown(readings);
  }, [userId, readings]);

  if (!userId) {
    return <div className="text-center py-8 text-red-500">Invalid user.</div>;
  }

  if (profileLoading) {
    return <div className="text-center py-8 text-gray-500">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="text-center py-8 text-gray-500">User not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/leaderboard"
          className="text-blue-600 hover:text-blue-800"
          aria-label="Back to leaderboard"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-lg font-semibold text-gray-900">
          {getFirstName(profile.name)}&apos;s Books
        </h2>
      </div>

      {scoreBreakdown && <ScoreDisplay breakdown={scoreBreakdown} />}

      <BookList
        userId={userId}
        readings={readings}
        booksById={booksById}
        loading={loading}
        error={error}
        readOnly
      />
    </div>
  );
}
