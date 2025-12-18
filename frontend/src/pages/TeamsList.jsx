import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { LoadingSpinner } from '../components/LoadingSpinner'
import './TeamsList.css'

export function TeamsList({ onCountChange, bypassCache = false }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [teamsWithMembers, setTeamsWithMembers] = useState({})
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 })

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const result = await api.get('/teams', { bypassCache })
        const teamsList = result.teams || result || []

        // Add synthetic "foursquare" team at the beginning
        const syntheticTeam = {
          id: 'foursquare-synthetic',
          slug: 'foursquare',
          name: 'Foursquare (All Users)',
          description: 'Aggregated view of all distinct users across all teams',
          privacy: 'synthetic'
        }

        const teamsWithSynthetic = [syntheticTeam, ...teamsList]

        // Initialize teams without sorting yet
        setTeams(teamsWithSynthetic)

        // Report count to parent (include synthetic team)
        if (onCountChange) {
          onCountChange(teamsWithSynthetic.length)
        }
        setLoadingProgress({ loaded: 0, total: teamsList.length })
        setLoading(false)

        // Fetch members for each team
        const memberPromises = teamsList.map(async (team) => {
          try {
            const membersData = await api.get(`/teams/${team.slug}/members`, { bypassCache })
            const members = membersData.members || []

            // Update state with this team's member data
            setTeamsWithMembers(prev => ({
              ...prev,
              [team.slug]: {
                members,
                memberCount: members.length,
                loaded: true
              }
            }))

            // Update progress
            setLoadingProgress(prev => ({
              ...prev,
              loaded: prev.loaded + 1
            }))

            return { slug: team.slug, members, memberCount: members.length }
          } catch (err) {
            console.error(`Error fetching members for ${team.slug}:`, err)
            setTeamsWithMembers(prev => ({
              ...prev,
              [team.slug]: {
                members: [],
                memberCount: 0,
                loaded: true,
                error: true
              }
            }))

            setLoadingProgress(prev => ({
              ...prev,
              loaded: prev.loaded + 1
            }))

            return { slug: team.slug, members: [], memberCount: 0 }
          }
        })

        // Wait for all to complete and collect members
        const memberResults = await Promise.all(memberPromises)

        // Create synthetic "foursquare" team with all distinct users
        const allMembers = new Map() // Use Map to deduplicate by login
        memberResults.forEach(result => {
          if (result?.members) {
            result.members.forEach(member => {
              allMembers.set(member.login, member)
            })
          }
        })

        const distinctMembers = Array.from(allMembers.values())

        // Add synthetic team to teamsWithMembers
        setTeamsWithMembers(prev => ({
          ...prev,
          'foursquare': {
            members: distinctMembers,
            memberCount: distinctMembers.length,
            loaded: true,
            synthetic: true
          }
        }))

      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }

    fetchTeams()
  }, [onCountChange, bypassCache])

  // Sort teams by member count (using loaded data)
  const sortedTeams = [...teams].sort((a, b) => {
    const countA = teamsWithMembers[a.slug]?.memberCount || 0
    const countB = teamsWithMembers[b.slug]?.memberCount || 0
    return countB - countA
  })

  const filteredTeams = sortedTeams.filter((team) => {
    const query = searchQuery.toLowerCase()
    const name = (team.name || '').toLowerCase()
    const description = (team.description || '').toLowerCase()
    return name.includes(query) || description.includes(query)
  })

  if (loading) {
    return <LoadingSpinner message="Loading teams..." />
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error loading teams</h3>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="teams-list-container">
      <div className="teams-header">
        <h2>GitHub Teams</h2>
        <p>Select a team to view and track their pull requests</p>
      </div>

      {loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total && (
        <div className="loading-progress">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${(loadingProgress.loaded / loadingProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            Loading team details: {loadingProgress.loaded} of {loadingProgress.total}
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search teams by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <div className="search-results-count">
              {filteredTeams.length} {filteredTeams.length === 1 ? 'team' : 'teams'} found
            </div>
          )}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="empty-state">
          <p>No teams found. Make sure your backend is configured with team data.</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="empty-state">
          <p>No teams match your search "{searchQuery}"</p>
        </div>
      ) : (
        <div className="teams-grid">
          {filteredTeams.map((team) => {
            const teamData = teamsWithMembers[team.slug]
            const isLoading = !teamData?.loaded
            const members = teamData?.members || []
            const memberCount = teamData?.memberCount || 0

            return (
              <Link
                key={team.id || team.slug || team.name}
                to={`/team/${team.slug || team.id || team.name}`}
                className={`team-card ${isLoading ? 'team-card-loading' : ''}`}
              >
                <div className="team-card-header">
                  <h3>{team.name}</h3>
                </div>
                {team.description && (
                  <p className="team-description">{team.description}</p>
                )}

                <div className="team-meta">
                  {isLoading ? (
                    <div className="team-loading-indicator">
                      <div className="spinner-small" />
                      <span>Loading members...</span>
                    </div>
                  ) : (
                    <>
                      <span className="team-stat">
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </span>
                      {team.privacy && (
                        <span className="team-privacy">{team.privacy}</span>
                      )}
                    </>
                  )}
                </div>

                {!isLoading && members.length > 0 && (
                  <div className="team-members-preview">
                    {members.slice(0, 5).map((member) => (
                      <span key={member.login} className="member-avatar-small" title={member.login}>
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.login} />
                        ) : (
                          member.login.charAt(0).toUpperCase()
                        )}
                      </span>
                    ))}
                    {members.length > 5 && (
                      <span className="member-overflow">+{members.length - 5}</span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
