import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { LoadingSpinner } from '../components/LoadingSpinner'
import './UsersList.css'

export function UsersList({ onCountChange, bypassCache = false }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Try to fetch all users - the backend might need to implement this endpoint
        const result = await api.get('/users', { bypassCache })
        const usersList = result.users || result || []
        setUsers(usersList)

        // Report count to parent
        if (onCountChange) {
          onCountChange(usersList.length)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [onCountChange, bypassCache])

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase()
    const username = (user.login || user.username || user.name || '').toLowerCase()
    const name = (user.name || '').toLowerCase()
    return username.includes(query) || name.includes(query)
  })

  if (loading) {
    return <LoadingSpinner message="Loading users..." />
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error loading users</h3>
        <p>{error}</p>
        <p className="error-hint">The backend may need to implement the /api/users endpoint</p>
      </div>
    )
  }

  return (
    <div className="users-list-container">
      {users.length > 0 && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search users by username or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <div className="search-results-count">
              {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
            </div>
          )}
        </div>
      )}

      {users.length === 0 ? (
        <div className="empty-state">
          <p>No users found. The backend may need to implement the /api/users endpoint.</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state">
          <p>No users match your search "{searchQuery}"</p>
        </div>
      ) : (
        <div className="users-grid">
          {filteredUsers.map((user) => {
            const username = user.login || user.username || user.name
            return (
              <Link
                key={username}
                to={`/user/${username}`}
                state={{ from: '/' }}
                className="user-card"
              >
                <div className="user-card-content">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={username} className="user-avatar-small" />
                  ) : (
                    <div className="user-avatar-placeholder">
                      {username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="user-info-small">
                    <div className="user-name-small">{user.name || username}</div>
                    <div className="user-username-small">@{username}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
