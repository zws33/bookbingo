import { Link } from 'react-router-dom';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { PageStatus } from '../components/PageStatus';
import { Avatar } from '../components/ui';

export function LeaderboardPage() {
  const { rows, loading, error } = useLeaderboard();

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-on-surface-variant">
        No participants yet.
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant text-left text-on-surface-variant text-xs uppercase tracking-wide">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Reader</th>
            <th className="px-4 py-3 text-right">Books</th>
            <th className="px-4 py-3 text-right">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {rows.map(({ userId, name, photoURL, score, bookCount }, index) => (
            <tr
              key={userId}
              className="hover:bg-surface-container transition-colors"
            >
              <td className="px-4 py-3 text-on-surface-variant font-medium">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/users/${userId}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <Avatar name={name} photoURL={photoURL ?? undefined} />
                  <span className="font-medium text-on-surface">{name}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-on-surface-variant">
                {bookCount}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-on-surface">
                {score.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
