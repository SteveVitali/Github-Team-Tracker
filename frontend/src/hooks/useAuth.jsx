import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check authentication status on mount
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      // If PAT is present, consider user authenticated without checking backend
      if (api.hasPAT()) {
        // Use a generic user object for PAT auth
        setUser({
          username: 'PAT User',
          name: 'Personal Access Token',
          isPAT: true
        })
      } else {
        // Otherwise check OAuth session
        const { user } = await api.getCurrentUser()
        setUser(user)
      }
    } catch (error) {
      // Not authenticated
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await api.logout()
      setUser(null)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const loginWithPAT = async (token) => {
    api.loginWithPAT(token)
    await checkAuth()
  }

  return (
    <AuthContext.Provider value={{ user, loading, checkAuth, logout, loginWithPAT }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
