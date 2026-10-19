import { Link, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { CatalogPage } from './pages/CatalogPage';
import { signInWithGoogle, signOutUser } from './lib/auth';
import { syncMyProfile } from './data/userProfile';
import { useAuth } from './hooks/useAuth';
import { useReadings } from './hooks/useReadings';
import { BingoBoard } from './components/BingoBoard';
import {
  ChallengeProvider,
  useActiveChallenge,
} from './challenge/ChallengeContext';
import { ChallengeLayout } from './challenge/ChallengeLayout';
import { ChallengeResolver } from './challenge/ChallengeResolver';
import { ChallengeSwitcher } from './components/ChallengeSwitcher';
import { ChallengeListPage } from './pages/ChallengeListPage';
import { CreateChallengePage } from './pages/CreateChallengePage';
import { JoinChallengePage } from './pages/JoinChallengePage';
import { MembersPage } from './pages/MembersPage';
import { ChallengeSettingsPage } from './pages/ChallengeSettingsPage';
import { MyBooksPage } from './pages/MyBooksPage';
import { ReadingListPage } from './pages/ReadingListPage';
import { UserBooksPage } from './pages/UserBooksPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { StagingBanner } from './components/StagingBanner';
import { FeedbackModal } from './components/FeedbackModal';
import { Button } from './components/ui/index.js';
import { log } from '@bookbingo/lib-util';
import { useEffect, useState, useCallback } from 'react';

const isStaging = import.meta.env.MODE === 'staging';

/**
 * The board reads the signed-in user's readings for the active challenge, so
 * it cannot be mounted above the layout that resolves one.
 */
function BoardRoute({ userId }: { userId: string }) {
  const { challenge } = useActiveChallenge();
  const { readings } = useReadings(challenge.id, userId);
  return <BingoBoard readings={readings} />;
}

function SignedInRoutes({ userId }: { userId: string }) {
  return (
    <Routes>
      <Route path="/" element={<ChallengeResolver />} />
      <Route path="/challenges" element={<ChallengeListPage />} />
      <Route path="/challenges/new" element={<CreateChallengePage />} />
      <Route path="/challenges/join" element={<JoinChallengePage />} />

      <Route path="/c/:challengeId" element={<ChallengeLayout />}>
        <Route index element={<MyBooksPage userId={userId} />} />
        <Route
          path="reading-list"
          element={<ReadingListPage userId={userId} />}
        />
        <Route path="board" element={<BoardRoute userId={userId} />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="settings" element={<ChallengeSettingsPage />} />
        <Route
          path="users"
          element={<Navigate to="../leaderboard" replace />}
        />
        <Route path="users/:userId" element={<UserBooksPage />} />
      </Route>

      <Route path="/library" element={<LibraryPage />} />

      {/*
        The pre-challenge paths. They carry no challenge, so they go through
        the resolver rather than guessing one.
      */}
      <Route path="/reading-list" element={<Navigate to="/" replace />} />
      <Route path="/board" element={<Navigate to="/" replace />} />
      <Route path="/leaderboard" element={<Navigate to="/" replace />} />
      <Route path="/users/*" element={<Navigate to="/" replace />} />

      {import.meta.env.DEV && (
        <Route path="/catalog" element={<CatalogPage />} />
      )}
    </Routes>
  );
}

function App() {
  const { user, loading, error } = useAuth();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      log.error('Sign in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      log.error('Sign out error:', err);
    }
  };

  const handleCloseFeedback = useCallback(() => setIsFeedbackOpen(false), []);

  useEffect(() => {
    if (user) {
      // Fire-and-forget: the profile is written from the ID token, so there is
      // nothing to send and nothing on this screen waits for the result.
      syncMyProfile().catch((err) => {
        log.error('save user error:', err);
      });
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-on-surface-variant">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-error">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <ChallengeProvider enabled={user !== null}>
      <div className={`min-h-screen bg-surface${isStaging ? ' pt-8' : ''}`}>
        {isStaging && <StagingBanner />}
        <header className="bg-surface-container-lowest shadow">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to="/"
                className="font-display text-xl font-bold text-on-surface shrink-0"
              >
                📚
                <span className="hidden sm:inline"> Book Bingo</span>
              </Link>
              {user && <ChallengeSwitcher />}
            </div>
            {user && (
              <div className="flex items-center gap-3 shrink-0">
                <NavLink
                  to="/library"
                  className={({ isActive }) =>
                    `hidden sm:inline text-sm font-medium ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`
                  }
                >
                  Library
                </NavLink>
                {import.meta.env.DEV && (
                  <NavLink
                    to="/catalog"
                    className={({ isActive }) =>
                      `hidden sm:inline text-sm font-medium ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`
                    }
                  >
                    Catalog
                  </NavLink>
                )}
                <Button
                  variant="outline"
                  className="text-sm"
                  onClick={() => setIsFeedbackOpen(true)}
                >
                  Send Feedback
                </Button>
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <Button
                  variant="outline"
                  className="text-sm"
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6">
          {user ? (
            <SignedInRoutes userId={user.uid} />
          ) : (
            <div className="text-center py-12">
              <h2 className="font-display text-3xl font-bold text-on-surface mb-4">
                Welcome to Book Bingo
              </h2>
              <p className="text-on-surface-variant mb-8">
                Track your reading progress and compete with friends.
              </p>
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-3 bg-surface-container-lowest border border-outline rounded-lg px-6 py-3 text-on-surface-variant font-medium hover:bg-surface-container hover:shadow-md transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </button>
            </div>
          )}
        </main>
        <FeedbackModal isOpen={isFeedbackOpen} onClose={handleCloseFeedback} />
      </div>
    </ChallengeProvider>
  );
}

export default App;
