import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { TeamDetail } from './pages/TeamDetail'
import { UserDetail } from './pages/UserDetail'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <Link to="/" className="header-link">
            <h1>GitHub Team Tracker</h1>
          </Link>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/team/:teamSlug" element={<TeamDetail />} />
            <Route path="/user/:username" element={<UserDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
