import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { chunkDateRange, getDateRangeForPeriod, formatDateISO, getChunkStart, getChunkEnd } from '../utils/dateChunking'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './TeamDetail.css'

export function TeamDetail() {
  const { teamSlug } = useParams()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [memberStats, setMemberStats] = useState({}) // { username: { prs: N, commits: N, reviews: N, total: N, loading: bool } }
  const [fetchProgress, setFetchProgress] = useState({ loaded: 0, total: 0 })
  const [period, setPeriod] = useState('30days')
  const [refreshingLatest, setRefreshingLatest] = useState(false)
  const [teamPRs, setTeamPRs] = useState([]) // All PRs from all team members
  const [collapsedSections, setCollapsedSections] = useState({ closed: true, merged: true, open: false })
  const [chartView, setChartView] = useState('by-type') // 'total' or 'by-type'

  // Restore scroll position when returning to this page
  useScrollRestoration(`team-detail-${teamSlug}`)

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const result = await api.get(`/teams/${teamSlug}/members`)
        setTeam(result)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchTeam()
  }, [teamSlug])

  // Separate effect to fetch member contributions when team or period changes
  useEffect(() => {
    const members = team?.members || []
    if (members.length > 0) {
      fetchMemberContributions(members)
    }

    async function fetchMemberContributions(members) {
      // Reset member stats and team PRs before fetching new period
      setMemberStats({})
      setTeamPRs([])
      setFetchProgress({ loaded: 0, total: 0 })

      // Get date range for selected period
      const { from, to } = getDateRangeForPeriod(period)
      const chunks = chunkDateRange(from, to)

      // Initialize member stats with loading state
      const initialStats = {}
      members.forEach(member => {
        const username = member.login || member.username || member.name || member
        initialStats[username] = {
          prs: 0,
          commits: 0,
          reviews: 0,
          total: 0,
          loading: true,
          loadedChunks: 0,
          totalChunks: chunks.length * 3 // 3 endpoints per chunk
        }
      })
      setMemberStats(initialStats)

      // Total requests: members * chunks * 3 endpoints
      const totalRequests = members.length * chunks.length * 3
      setFetchProgress({ loaded: 0, total: totalRequests })

      // Counter for progress tracking
      const counter = { value: 0 }

      // Fetch stats for all members in parallel
      await Promise.all(
        members.map(async (member) => {
          const username = member.login || member.username || member.name || member

          let userPrsCount = 0
          let userCommitsCount = 0
          let userReviewsCount = 0

          // Fetch all chunks for this user
          await Promise.all(
            chunks.map(async (chunk) => {
              const fromStr = formatDateISO(chunk.from)
              const toStr = formatDateISO(chunk.to)

              // Fetch PRs
              try {
                const prsData = await api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`)
                const prsCount = prsData.prs?.length || 0
                userPrsCount += prsCount

                // Add PRs to team PR list with author info
                if (prsData.prs && prsData.prs.length > 0) {
                  const prsWithAuthor = prsData.prs.map(pr => ({
                    ...pr,
                    author: username
                  }))

                  setTeamPRs(prev => {
                    const existingIds = new Set(prev.map(pr => pr.id))
                    const newPRs = prsWithAuthor.filter(pr => !existingIds.has(pr.id))
                    return [...prev, ...newPRs]
                  })
                }

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })

                // Update stats progressively
                setMemberStats(prev => ({
                  ...prev,
                  [username]: {
                    ...prev[username],
                    prs: userPrsCount,
                    total: userPrsCount + (prev[username]?.commits || 0) + (prev[username]?.reviews || 0),
                    loadedChunks: (prev[username]?.loadedChunks || 0) + 1
                  }
                }))
              } catch (err) {
                console.error(`Error fetching PRs for ${username}:`, err)
                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })
              }

              // Fetch commits
              try {
                const commitsData = await api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`)
                const commitsCount = commitsData.commits?.length || 0
                userCommitsCount += commitsCount

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })

                // Update stats progressively
                setMemberStats(prev => ({
                  ...prev,
                  [username]: {
                    ...prev[username],
                    commits: userCommitsCount,
                    total: (prev[username]?.prs || 0) + userCommitsCount + (prev[username]?.reviews || 0),
                    loadedChunks: (prev[username]?.loadedChunks || 0) + 1
                  }
                }))
              } catch (err) {
                console.error(`Error fetching commits for ${username}:`, err)
                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })
              }

              // Fetch reviews
              try {
                const reviewsData = await api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`)
                const reviewsCount = reviewsData.reviews?.length || 0
                userReviewsCount += reviewsCount

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })

                // Update stats progressively
                setMemberStats(prev => ({
                  ...prev,
                  [username]: {
                    ...prev[username],
                    reviews: userReviewsCount,
                    total: (prev[username]?.prs || 0) + (prev[username]?.commits || 0) + userReviewsCount,
                    loadedChunks: (prev[username]?.loadedChunks || 0) + 1
                  }
                }))
              } catch (err) {
                console.error(`Error fetching reviews for ${username}:`, err)
                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests })
              }
            })
          )

          // Mark this member as loaded
          setMemberStats(prev => ({
            ...prev,
            [username]: {
              ...prev[username],
              loading: false
            }
          }))
        })
      )
    }
  }, [team, period])

  const refreshLatestChunk = async () => {
    if (!team?.members || team.members.length === 0) return

    setRefreshingLatest(true)
    try {
      // Get the chunk that contains today
      const today = new Date()
      const latestChunk = {
        from: getChunkStart(today),
        to: getChunkEnd(today)
      }

      const fromStr = formatDateISO(latestChunk.from)
      const toStr = formatDateISO(latestChunk.to)

      console.log(`[TeamDetail] Refreshing latest chunk: ${fromStr} to ${toStr}`)

      const members = team.members

      // Fetch latest chunk for all members in parallel
      await Promise.all(
        members.map(async (member) => {
          const username = member.login || member.username || member.name || member

          try {
            const [prsData, commitsData, reviewsData] = await Promise.all([
              api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { bypassCache: true }),
              api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { bypassCache: true }),
              api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { bypassCache: true })
            ])

            // Update member stats (counts will be recalculated based on all data)
            // Since we're just counting, we can simply trigger a re-fetch by not doing anything here
            // The deduplication in the main fetch will handle it
            console.log(`[TeamDetail] Refreshed latest chunk for ${username}`)
          } catch (err) {
            console.error(`[TeamDetail] Error refreshing latest chunk for ${username}:`, err)
          }
        })
      )

      console.log('[TeamDetail] Latest chunk refreshed for all members, cache updated')
    } catch (err) {
      console.error('[TeamDetail] Error refreshing latest chunk:', err)
    } finally {
      setRefreshingLatest(false)
    }
  }

  // Group and sort team PRs by status (must be before early returns)
  const groupedTeamPRs = useMemo(() => {
    const groups = {
      open: [],
      merged: [],
      closed: []
    }

    teamPRs.forEach(pr => {
      // Determine single status: Merged > Closed > Open
      if (pr.mergedAt) {
        groups.merged.push(pr)
      } else if (pr.state?.toLowerCase() === 'closed') {
        groups.closed.push(pr)
      } else {
        groups.open.push(pr)
      }
    })

    // Sort each group by date descending (newest first)
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    })

    return groups
  }, [teamPRs])

  // Transform memberStats into chart data (sorted by total contributions descending)
  const chartData = useMemo(() => {
    const members = team?.members || []
    if (members.length === 0) return []

    return members
      .map(member => {
        const username = member.login || member.username || member.name || member
        const stats = memberStats[username] || { prs: 0, commits: 0, reviews: 0, total: 0 }
        return {
          name: username,
          PRs: stats.prs,
          Commits: stats.commits,
          Reviews: stats.reviews,
          Total: stats.total
        }
      })
      .sort((a, b) => b.Total - a.Total) // Sort by total descending
  }, [team, memberStats])

  // Sort members: completed first, then by total contributions (descending)
  const sortedMembers = team?.members ? [...team.members].sort((a, b) => {
    const usernameA = a.login || a.username || a.name || a
    const usernameB = b.login || b.username || b.name || b
    const statsA = memberStats[usernameA] || { total: 0, loading: true }
    const statsB = memberStats[usernameB] || { total: 0, loading: true }

    // Sort by loading state first (completed before loading)
    if (statsA.loading !== statsB.loading) {
      return statsA.loading ? 1 : -1
    }

    // Then by total contributions (descending)
    return statsB.total - statsA.total
  }) : []

  if (loading) {
    return <LoadingSpinner message="Loading team details..." />
  }

  if (error) {
    return (
      <div className="team-detail-container">
        <Link to="/" className="back-link">← Back to Teams</Link>
        <div className="error-container">
          <h3>Error loading team</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const toggleSection = (section) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const periodOptions = [
    { value: '30days', label: '30 Days' },
    { value: '90days', label: '90 Days' },
    { value: '365days', label: '365 Days' },
    { value: 'all-time', label: 'All Time' }
  ]

  const getPeriodLabel = () => {
    const option = periodOptions.find(opt => opt.value === period)
    return option ? option.label : '30 Days'
  }

  return (
    <div className="team-detail-container">
      <Link to="/" className="back-link">← Back to Teams</Link>

      {/* Progress bar at the top */}
      {fetchProgress.total > 0 && fetchProgress.loaded < fetchProgress.total && (
        <div className="fetch-progress-top">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${(fetchProgress.loaded / fetchProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            Loading contributions: {fetchProgress.loaded} of {fetchProgress.total} requests completed
            ({Math.round((fetchProgress.loaded / fetchProgress.total) * 100)}%)
          </div>
        </div>
      )}

      <div className="team-info">
        <h2>{team?.name || teamSlug}</h2>
        {team?.description && <p className="team-description">{team.description}</p>}

        <div className="team-stats">
          {team?.memberCount !== undefined && (
            <div className="stat-box">
              <span className="stat-label">Members</span>
              <span className="stat-value">{team.memberCount}</span>
            </div>
          )}
          {team?.privacy && (
            <div className="stat-box">
              <span className="stat-label">Privacy</span>
              <span className="stat-value">{team.privacy}</span>
            </div>
          )}
        </div>

        {/* Time range selector */}
        <div className="time-range-selector">
          <label htmlFor="period-select" className="time-range-label">Time Range:</label>
          <div className="days-buttons">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`day-button ${period === option.value ? 'day-button-active' : ''}`}
                disabled={fetchProgress.total > 0 && fetchProgress.loaded < fetchProgress.total}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={refreshLatestChunk}
              className="refresh-button"
              disabled={refreshingLatest || (fetchProgress.total > 0 && fetchProgress.loaded < fetchProgress.total)}
              title="Refresh latest data for all members (bypasses cache)"
            >
              {refreshingLatest ? '↻ Refreshing...' : '↻ Refresh Latest'}
            </button>
          </div>
        </div>

        {/* Contributions Chart */}
        {chartData.length > 0 && (
          <div className="contributions-chart-section">
            <div className="chart-header">
              <h3>Team Contributions</h3>
              <div className="chart-view-toggle">
                <button
                  onClick={() => setChartView('total')}
                  className={`toggle-button ${chartView === 'total' ? 'toggle-button-active' : ''}`}
                >
                  Total
                </button>
                <button
                  onClick={() => setChartView('by-type')}
                  className={`toggle-button ${chartView === 'by-type' ? 'toggle-button-active' : ''}`}
                >
                  By Type
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                  style={{ fontSize: '0.75rem' }}
                />
                <YAxis />
                <Tooltip />
                {chartView === 'by-type' && <Legend />}
                {chartView === 'total' ? (
                  <Bar dataKey="Total" fill="#0969da" />
                ) : (
                  <>
                    <Bar dataKey="PRs" stackId="a" fill="#0969da" />
                    <Bar dataKey="Commits" stackId="a" fill="#2da44e" />
                    <Bar dataKey="Reviews" stackId="a" fill="#bf3989" />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {sortedMembers.length > 0 && (
          <div className="team-members-section">
            <h3>Team Members ({sortedMembers.length})</h3>
            <div className="members-grid">
              {sortedMembers.map((member, index) => {
                const username = member.login || member.username || member.name || member
                const avatarUrl = member.avatarUrl || member.avatar_url
                const stats = memberStats[username] || { prs: 0, commits: 0, reviews: 0, total: 0, loading: true }

                return (
                  <Link
                    key={index}
                    to={`/user/${username}`}
                    className={`member-card ${stats.loading ? 'member-card-loading' : ''}`}
                  >
                    <div className="member-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={username} />
                      ) : (
                        <div className="member-avatar-placeholder">
                          {username.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="member-name">{username}</div>

                    {stats.loading && (
                      <div className="member-progress-bar">
                        <div
                          className="member-progress-fill"
                          style={{
                            width: `${(stats.loadedChunks / stats.totalChunks) * 100}%`
                          }}
                        />
                      </div>
                    )}

                    {stats.loading ? (
                      <div className="member-stats-loading">
                        <div className="member-stats-loading-text">
                          Loading... ({stats.loadedChunks}/{stats.totalChunks})
                        </div>
                      </div>
                    ) : null}

                    <div className="member-stats">
                      <div className="member-stat">
                        <span className="member-stat-label">PRs</span>
                        <span className="member-stat-value">{stats.prs}</span>
                      </div>
                      <div className="member-stat">
                        <span className="member-stat-label">Commits</span>
                        <span className="member-stat-value">{stats.commits}</span>
                      </div>
                      <div className="member-stat">
                        <span className="member-stat-label">Reviews</span>
                        <span className="member-stat-value">{stats.reviews}</span>
                      </div>
                      <div className="member-stat-total">
                        <span className="member-stat-label">Total</span>
                        <span className="member-stat-value-total">{stats.total}</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Team Pull Requests */}
        {teamPRs.length > 0 && (
          <div className="team-prs-section">
            <h3>Team Pull Requests ({teamPRs.length})</h3>

            {/* Open PRs */}
            {groupedTeamPRs.open.length > 0 && (
              <div className="pr-status-group">
                <button
                  className="pr-group-header"
                  onClick={() => toggleSection('open')}
                >
                  <span className="pr-group-title">
                    Open ({groupedTeamPRs.open.length})
                  </span>
                  <span className={`expand-icon ${collapsedSections.open ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.open && (
                  <div className="team-prs-list">
                    {groupedTeamPRs.open.map((pr) => (
                      <div key={pr.id} className="team-pr-card">
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                          {pr.title}
                        </a>
                        <span className="status-badge status-open">Open</span>
                        {pr.draft && <span className="meta-badge draft">Draft</span>}
                        <Link to={`/user/${pr.author}`} className="pr-author">@{pr.author}</Link>
                        <span className="pr-repo">{pr.repository}</span>
                        <span className="pr-number">#{pr.number}</span>
                        <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Merged PRs */}
            {groupedTeamPRs.merged.length > 0 && (
              <div className="pr-status-group">
                <button
                  className="pr-group-header"
                  onClick={() => toggleSection('merged')}
                >
                  <span className="pr-group-title">
                    Merged ({groupedTeamPRs.merged.length})
                  </span>
                  <span className={`expand-icon ${collapsedSections.merged ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.merged && (
                  <div className="team-prs-list">
                    {groupedTeamPRs.merged.map((pr) => (
                      <div key={pr.id} className="team-pr-card">
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                          {pr.title}
                        </a>
                        <span className="status-badge status-merged">Merged</span>
                        <Link to={`/user/${pr.author}`} className="pr-author">@{pr.author}</Link>
                        <span className="pr-repo">{pr.repository}</span>
                        <span className="pr-number">#{pr.number}</span>
                        <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Closed PRs */}
            {groupedTeamPRs.closed.length > 0 && (
              <div className="pr-status-group">
                <button
                  className="pr-group-header"
                  onClick={() => toggleSection('closed')}
                >
                  <span className="pr-group-title">
                    Closed ({groupedTeamPRs.closed.length})
                  </span>
                  <span className={`expand-icon ${collapsedSections.closed ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.closed && (
                  <div className="team-prs-list">
                    {groupedTeamPRs.closed.map((pr) => (
                      <div key={pr.id} className="team-pr-card">
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                          {pr.title}
                        </a>
                        <span className="status-badge status-closed">Closed</span>
                        <Link to={`/user/${pr.author}`} className="pr-author">@{pr.author}</Link>
                        <span className="pr-repo">{pr.repository}</span>
                        <span className="pr-number">#{pr.number}</span>
                        <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
