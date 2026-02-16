import { Link, useParams } from 'react-router-dom';
import { useReadings } from '../hooks/useReadings';
import { useUserProfile } from '../hooks/useUserProfile';
import { BookList } from '../components/BookList';

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? 'User';
}

export function UserBooksPage() {
  const { userId } = useParams<{ userId: string }>();
  const { profile, loading: profileLoading } = useUserProfile(userId ?? '');
  const { readings, loading: readingsLoading, error: readingsError } = useReadings(userId ?? '');

  if (!userId) {
    return <div className="text-center py-8 text-red-500">Invalid user.</div>;
  }

  if (profileLoading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (!profile) {
    return <div className="text-center py-8 text-gray-500">User not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/users"
          className="text-blue-600 hover:text-blue-800"
          aria-label="Back to people"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-lg font-semibold text-gray-900">
          {getFirstName(profile.name)}&apos;s Books
        </h2>
      </div>

      <BookList
        userId={userId}
        readings={readings}
        loading={readingsLoading}
        error={readingsError}
        readOnly
      />
    </div>
  );
}
