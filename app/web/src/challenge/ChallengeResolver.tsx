import { Navigate } from 'react-router-dom';
import { useChallenges } from './ChallengeContext';
import { readLastChallengeId } from './lastChallenge';
import { PageStatus } from '../components/PageStatus';

/**
 * `/` is a decision, not a page. With one membership there is nothing to
 * choose, and with a remembered one the chooser would be a toll booth on
 * every sign-in — so the switcher in the header, not this route, is how a
 * returning user changes challenge.
 */
export function ChallengeResolver() {
  const { challenges, loading, error } = useChallenges();

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  if (challenges.length === 0) {
    return <Navigate to="/challenges" replace />;
  }

  const remembered = readLastChallengeId();
  const target =
    challenges.find((summary) => summary.challenge.id === remembered) ??
    (challenges.length === 1 ? challenges[0] : undefined);

  return target ? (
    <Navigate to={`/c/${target.challenge.id}`} replace />
  ) : (
    <Navigate to="/challenges" replace />
  );
}
