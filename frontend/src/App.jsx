import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { TeamDetail } from './pages/TeamDetail'
import { UserDetail } from './pages/UserDetail'

function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="header">
      <Link to="/" className="header-link">
        <h1>GitHub Team Tracker</h1>
      </Link>
      {user && (
        <div className="header-user">
          <span className="user-name">{user.name || user.username}</span>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>
      )}
    </header>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <Header />
          <main className="main">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/team/:teamSlug"
                element={
                  <ProtectedRoute>
                    <TeamDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/user/:username"
                element={
                  <ProtectedRoute>
                    <UserDetail />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
