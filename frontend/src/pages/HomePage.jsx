import { useState } from 'react'
import { Tabs } from '../components/Tabs'
import { TeamsList } from './TeamsList'
import { UsersList } from './UsersList'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { indexedDBCache } from '../indexeddb-cache'
import './HomePage.css'

export function HomePage() {
  const [activeTab, setActiveTab] = useState('teams')
  const [teamsCount, setTeamsCount] = useState(null)
  const [usersCount, setUsersCount] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Restore scroll position when returning to homepage
  useScrollRestoration('homepage')

  const tabs = [
    { id: 'teams', label: teamsCount !== null ? `Teams (${teamsCount})` : 'Teams' },
    { id: 'users', label: usersCount !== null ? `Users (${usersCount})` : 'Users' }
  ]

  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshKey(prev => prev + 1)
    // Reset refreshing state after a short delay to show visual feedback
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const handleExportCache = async () => {
    try {
      // Get all IndexedDB cache entries
      const cacheEntries = await indexedDBCache.getAll()

      // Convert to object format for export
      const exportData = {}
      cacheEntries.forEach(entry => {
        exportData[entry.key] = {
          data: entry.data,
          timestamp: entry.timestamp,
          ttl: entry.ttl
        }
      })

      // Create JSON file
      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // Create download link and trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `github-tracker-cache-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log(`✅ Exported ${cacheEntries.length} cache entries from IndexedDB`)
    } catch (error) {
      console.error('Failed to export cache:', error)
      alert('Failed to export cache. Check console for details.')
    }
  }

  return (
    <div className="homepage">
      <div className="homepage-header">
        <div className="homepage-header-content">
          <div>
            <h2>GitHub Team Tracker</h2>
            <p>Track and analyze your team's GitHub activity and contributions</p>
          </div>
          <div className="homepage-buttons">
            <button
              onClick={handleRefresh}
              className="refresh-button"
              disabled={isRefreshing}
              title="Refresh teams and users list (bypasses cache)"
            >
              {isRefreshing ? '↻ Refreshing...' : '↻ Refresh'}
            </button>
            <button
              onClick={handleExportCache}
              className="export-button"
              title="Export all cached data as JSON file"
            >
              ⬇ Export Cache
            </button>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'teams' ? (
        <TeamsList key={`teams-${refreshKey}`} onCountChange={setTeamsCount} bypassCache={refreshKey > 0} />
      ) : (
        <UsersList key={`users-${refreshKey}`} onCountChange={setUsersCount} bypassCache={refreshKey > 0} />
      )}
    </div>
  )
}
