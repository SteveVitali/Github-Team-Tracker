import { useState } from 'react'
import { Tabs } from '../components/Tabs'
import { TeamsList } from './TeamsList'
import { UsersList } from './UsersList'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import './HomePage.css'

export function HomePage() {
  const [activeTab, setActiveTab] = useState('teams')
  const [teamsCount, setTeamsCount] = useState(null)
  const [usersCount, setUsersCount] = useState(null)

  // Restore scroll position when returning to homepage
  useScrollRestoration('homepage')

  const tabs = [
    { id: 'teams', label: teamsCount !== null ? `Teams (${teamsCount})` : 'Teams' },
    { id: 'users', label: usersCount !== null ? `Users (${usersCount})` : 'Users' }
  ]

  return (
    <div className="homepage">
      <div className="homepage-header">
        <h2>GitHub Team Tracker</h2>
        <p>Track and analyze your team's GitHub activity and contributions</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'teams' ? (
        <TeamsList onCountChange={setTeamsCount} />
      ) : (
        <UsersList onCountChange={setUsersCount} />
      )}
    </div>
  )
}
