import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getScoreBreakdown } from '@bookbingo/lib-core';
import { useUsers } from '../hooks/useUsers';
import { useAllReadings } from '../hooks/useAllReadings';
import { PageStatus } from '../components/PageStatus';
import { Avatar } from '../components/ui';

export function LeaderboardPage() {
  const { users, loading: usersLoading, error: usersError } = useUsers();
  const {
    readingsByUser,
    loading: readingsLoading,
    error: readingsError,
  } = useAllReadings();

  const loading = usersLoading || readingsLoading;
  const error = usersError ?? readingsError;

  const rankedUsers = useMemo(() => {
    return users
      .map((user) => {
        const readings = readingsByUser.get(user.id) ?? [];
        const breakdown = getScoreBreakdown(readings);
        return { user, score: breakdown.score, bookCount: readings.length };
      })
      .sort((a, b) => b.score - a.score);
  }, [users, readingsByUser]);

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }
  if (rankedUsers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No participants yet.</div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Reader</th>
            <th className="px-4 py-3 text-right">Books</th>
            <th className="px-4 py-3 text-right">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rankedUsers.map(({ user, score, bookCount }, index) => (
            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-400 font-medium">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/users/${user.id}`}
                  className="flex items-center gap-3 hover:text-blue-600"
                >
                  <Avatar name={user.name} photoURL={user.photoURL ?? undefined} />
                  <span className="font-medium text-gray-900">{user.name}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {bookCount}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {score.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
