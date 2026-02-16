import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useUsers } from '../hooks/useUsers';

export function UsersPage() {
  const { users, loading, error } = useUsers();
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const query = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(query));
  }, [users, search]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search people..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

      {filteredUsers.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {users.length === 0 ? 'No users yet.' : 'No users match your search.'}
        </div>
      ) : (
        <div className="divide-y divide-gray-200 bg-white rounded-lg shadow">
          {filteredUsers.map((user) => (
            <Link
              key={user.id}
              to={`/users/${user.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-medium text-gray-900">{user.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
