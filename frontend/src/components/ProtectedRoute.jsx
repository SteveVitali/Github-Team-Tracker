import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { LoadingSpinner } from './LoadingSpinner.jsx'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
