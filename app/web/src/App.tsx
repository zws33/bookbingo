import { NavLink, Routes, Route } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import { saveUserProfile } from './lib/users';
import { useReadings } from './hooks/useReadings';
import { BingoBoard } from './components/BingoBoard';
import { MyBooksPage } from './pages/MyBooksPage';
import { UsersPage } from './pages/UsersPage';
import { UserBooksPage } from './pages/UserBooksPage';
import { StagingBanner } from './components/StagingBanner';

const isStaging = import.meta.env.MODE === 'staging';

function App() {
  const [user, loading, error] = useAuthState(auth);
  const { readings } = useReadings(user?.uid ?? '');

  const handleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
    } catch (err) {
      console.error('Sign in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50${isStaging ? ' pt-8' : ''}`}>
      {isStaging && <StagingBanner />}
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">📚 Book Bingo</h1>
          {user && (
            <div className="flex items-center gap-4">
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                />
              )}
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {user ? (
          <>
            <div className="flex gap-4 border-b border-gray-200 mb-6">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `pb-2 text-sm font-medium ${isActive ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`
                }
              >
                My Books
              </NavLink>
              <NavLink
                to="/board"
                className={({ isActive }) =>
                  `pb-2 text-sm font-medium ${isActive ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`
                }
              >
                Bingo Board
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `pb-2 text-sm font-medium ${isActive ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`
                }
              >
                People
              </NavLink>
            </div>

            <Routes>
              <Route path="/" element={<MyBooksPage userId={user.uid} />} />
              <Route path="/board" element={<BingoBoard readings={readings} />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:userId" element={<UserBooksPage />} />
            </Routes>
          </>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to Book Bingo
            </h2>
            <p className="text-gray-600 mb-8">
              Track your reading progress and compete with friends.
            </p>
            <button
              onClick={handleSignIn}
              className="inline-flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 hover:shadow-md transition-all"
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
    </div>
  );
}

export default App;
