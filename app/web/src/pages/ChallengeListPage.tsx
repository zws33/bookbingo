import { Link } from 'react-router-dom';
import { useChallenges } from '../challenge/ChallengeContext';
import { ChallengeCard } from '../components/ChallengeCard';
import { PageStatus } from '../components/PageStatus';
import { buttonClasses } from '../components/ui/Button.js';

const COMPACT = 'px-3 py-1.5 text-sm';

export function ChallengeListPage() {
  const { challenges, active, loading, error } = useChallenges();

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  if (challenges.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">🎲</div>
        <h2 className="font-display text-xl font-semibold text-on-surface">
          No challenges yet
        </h2>
        <p className="text-on-surface-variant mt-1 mb-6">
          Start one for your book club, or join the one your friends are already
          running.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/challenges/new" className={buttonClasses('primary')}>
            Create a challenge
          </Link>
          <Link to="/challenges/join" className={buttonClasses('outline')}>
            Join with a code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl font-semibold text-on-surface">
          Your challenges
        </h2>
        <div className="flex gap-2">
          <Link
            to="/challenges/join"
            className={buttonClasses('outline', COMPACT)}
          >
            Join
          </Link>
          <Link
            to="/challenges/new"
            className={buttonClasses('primary', COMPACT)}
          >
            Create
          </Link>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {challenges.map((summary) => (
          <li key={summary.challenge.id}>
            <ChallengeCard
              summary={summary}
              isActive={summary.challenge.id === active?.challenge.id}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
