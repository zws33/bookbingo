import { Link, useParams } from 'react-router-dom';
import { useReadings } from '../hooks/useReadings';
import { useUserProfile } from '../hooks/useUserProfile';
import { BookList } from '../components/BookList';
import { ScoreDisplay } from '../components/ScoreDisplay';

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? 'User';
}

export function UserBooksPage() {
  const { userId } = useParams<{ userId: string }>();
  const { profile, loading: profileLoading } = useUserProfile(userId ?? '');
  const {
    readings,
    score,
    loading: readingsLoading,
    error: readingsError,
  } = useReadings(userId ?? '');
  const loading = readingsLoading;
  const error = readingsError;
  const scoreBreakdown = readings.length > 0 ? score : null;

  if (!userId) {
    return <div className="text-center py-8 text-error">Invalid user.</div>;
  }

  if (profileLoading) {
    return (
      <div className="text-center py-8 text-on-surface-variant">
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-8 text-on-surface-variant">
        User not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/leaderboard"
          className="text-primary hover:text-on-primary-container"
          aria-label="Back to leaderboard"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h2 className="font-display text-lg font-semibold text-on-surface">
          {getFirstName(profile.name)}&apos;s Books
        </h2>
      </div>

      {scoreBreakdown && <ScoreDisplay breakdown={scoreBreakdown} />}

      <BookList
        userId={userId}
        readings={readings}
        loading={loading}
        error={error}
        readOnly
      />
    </div>
  );
}
