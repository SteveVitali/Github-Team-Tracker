import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/Button'

export default function LoginPage() {
  const [mode, setMode] = useState('oauth') // 'oauth' or 'pat'
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithPAT } = useAuth()

  const handleOAuthLogin = () => {
    api.initiateLogin()
  }

  const handlePATLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!token.trim()) {
      setError('Please enter a valid GitHub Personal Access Token')
      setLoading(false)
      return
    }

    try {
      await loginWithPAT(token)
      navigate('/')
    } catch (err) {
      setError('Failed to authenticate with the provided token. Please check your token and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            GitHub Team Tracker
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Track pull requests and contributions across your organization
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center gap-2 border-b border-gray-200">
          <button
            onClick={() => setMode('oauth')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'oauth'
                ? 'border-gray-800 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            OAuth
          </button>
          <button
            onClick={() => setMode('pat')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'pat'
                ? 'border-gray-800 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Personal Access Token
          </button>
        </div>

        <div className="mt-8 space-y-6">
          {mode === 'oauth' ? (
            <>
              <div className="rounded-md shadow-sm">
                <p className="text-center text-sm text-gray-600 mb-4">
                  Sign in with your GitHub account to get started
                </p>
              </div>
              <div>
                <Button
                  onClick={handleOAuthLogin}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  Sign in with GitHub
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md shadow-sm">
                <p className="text-center text-sm text-gray-600 mb-4">
                  Enter your GitHub Personal Access Token
                </p>
              </div>
              <form onSubmit={handlePATLogin} className="space-y-4">
                <div>
                  <label htmlFor="token" className="sr-only">
                    Personal Access Token
                  </label>
                  <input
                    id="token"
                    name="token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                  />
                </div>
                {error && (
                  <div className="text-sm text-red-600 text-center">
                    {error}
                  </div>
                )}
                <div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Signing in...' : 'Sign in with Token'}
                  </Button>
                </div>
                <div className="text-xs text-gray-500 text-center">
                  <p>Your token is stored locally and sent with API requests.</p>
                  <p className="mt-1">
                    Generate a token at{' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-700 underline hover:text-gray-900"
                    >
                      GitHub Settings
                    </a>
                  </p>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
