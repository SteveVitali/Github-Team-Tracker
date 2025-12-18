import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { indexedDBCache } from '../indexeddb-cache'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { chunkDateRange, getDateRangeForPeriod, formatDateISO, getChunkStart, getChunkEnd } from '../utils/dateChunking'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Tabs } from '../components/Tabs'
import './TeamDetail.css'

export function TeamDetail() {
  const { teamSlug } = useParams()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [memberStats, setMemberStats] = useState({}) // { username: { prs: N, commits: N, reviews: N, total: N, loading: bool } }
  const [fetchProgress, setFetchProgress] = useState({ loaded: 0, total: 0, errors: 0 })
  const [queueStats, setQueueStats] = useState({ active: 0, queued: 0, total: 0 })

  // Initialize period from localStorage for this specific team
  const [period, setPeriod] = useState(() => {
    const stored = localStorage.getItem(`team-period-${teamSlug}`)
    return stored || '7days'
  })

  const [refreshingLatest, setRefreshingLatest] = useState(false)
  const [teamPRs, setTeamPRs] = useState([]) // All PRs from all team members
  const [collapsedSections, setCollapsedSections] = useState({ closed: true, merged: true, open: false })
  const [collapsedUsers, setCollapsedUsers] = useState({}) // Track which user sections are collapsed
  const [isStacked, setIsStacked] = useState(true)
  const [visibleSeries, setVisibleSeries] = useState({ prs: true, commits: true, reviews: true })
  const [chunkStats, setChunkStats] = useState({}) // { 'YYYY-MM-DD': { prs: N, commits: N, reviews: N } }
  const [abortController, setAbortController] = useState(null)

  // Handler to cancel ongoing requests
  const handleCancelRequests = () => {
    if (abortController) {
      console.log('[TeamDetail] User cancelled requests')
      abortController.abort()
      // Clear the period selection to reset the UI
      setPeriod('')
      // Reset progress
      setFetchProgress({ loaded: 0, total: 0, errors: 0 })
    }
  }

  // Initialize activeTab from localStorage for this specific team
  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem(`team-tab-${teamSlug}`)
    return stored || 'prs'
  })

  // Restore scroll position when returning to this page
  useScrollRestoration(`team-detail-${teamSlug}`)

  // Save period to localStorage whenever it changes for this team
  useEffect(() => {
    localStorage.setItem(`team-period-${teamSlug}`, period)
  }, [teamSlug, period])

  // Save activeTab to localStorage whenever it changes for this team
  useEffect(() => {
    localStorage.setItem(`team-tab-${teamSlug}`, activeTab)
  }, [teamSlug, activeTab])

  useEffect(() => {
    // Subscribe to global queue stats
    const unsubscribe = api.onStatsChange((newStats) => {
      setQueueStats(newStats)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        // Handle synthetic "foursquare" team
        if (teamSlug === 'foursquare') {
          // Fetch all teams
          const teamsResult = await api.get('/teams')
          const teamsList = teamsResult.teams || teamsResult || []

          // Fetch members for each team and deduplicate
          const allMembersMap = new Map()

          await Promise.all(
            teamsList.map(async (team) => {
              try {
                const membersData = await api.get(`/teams/${team.slug}/members`)
                const members = membersData.members || []
                members.forEach(member => {
                  allMembersMap.set(member.login, member)
                })
              } catch (err) {
                console.error(`Error fetching members for ${team.slug}:`, err)
              }
            })
          )

          const distinctMembers = Array.from(allMembersMap.values())

          setTeam({
            name: 'Foursquare (All Users)',
            slug: 'foursquare',
            members: distinctMembers,
            memberCount: distinctMembers.length,
            description: 'Aggregated view of all distinct users across all teams'
          })
        } else {
          // Regular team fetch
          const result = await api.get(`/teams/${teamSlug}/members`)
          setTeam(result)
        }
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
    if (members.length === 0) return

    // Create AbortController for this fetch cycle
    const controller = new AbortController()
    setAbortController(controller)
    let isCancelled = false

    fetchMemberContributions(members, controller)

    // Cleanup function to abort ongoing requests when period changes
    return () => {
      console.log('[TeamDetail] Aborting previous fetch cycle')
      isCancelled = true
      controller.abort()
      setAbortController(null)
    }

    async function fetchMemberContributions(members, controller) {
      // Reset member stats and team PRs before fetching new period
      setMemberStats({})
      setTeamPRs([])
      setChunkStats({})
      setFetchProgress({ loaded: 0, total: 0, errors: 0 })

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
          totalChunks: chunks.length // Count chunks, not endpoints
        }
      })
      setMemberStats(initialStats)

      // Total requests: members * chunks * 3 endpoints
      const totalRequests = members.length * chunks.length * 3
      setFetchProgress({ loaded: 0, total: totalRequests, errors: 0 })

      // Counter for progress tracking
      const counter = { value: 0, errors: 0 }

      // Fetch stats for all members in parallel
      await Promise.all(
        members.map(async (member) => {
          const username = member.login || member.username || member.name || member

          let userPrsCount = 0
          let userCommitsCount = 0
          let userReviewsCount = 0
          let userLoadedChunks = 0 // Local counter for this user's chunks

          // Fetch all chunks for this user
          await Promise.all(
            chunks.map(async (chunk) => {
              const fromStr = formatDateISO(chunk.from)
              const toStr = formatDateISO(chunk.to)

              // Fetch PRs
              try {
                const prsData = await api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

                // Check if request was cancelled
                if (isCancelled) return

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

                // Update chunk stats (team-level aggregation)
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    prs: (prev[chunkKey]?.prs || 0) + prsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })

                // Update stats progressively
                if (!isCancelled) {
                  setMemberStats(prev => ({
                    ...prev,
                    [username]: {
                      ...prev[username],
                      prs: userPrsCount,
                      total: userPrsCount + (prev[username]?.commits || 0) + (prev[username]?.reviews || 0)
                    }
                  }))
                }
              } catch (err) {
                // Handle abort gracefully
                if (err.name === 'AbortError') {
                  console.log(`[TeamDetail] PR request aborted for ${username}`)
                  return
                }
                console.error(`Error fetching PRs for ${username}:`, err)
                counter.value++
                counter.errors++
                if (!isCancelled) {
                  setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })
                }
              }

              // Fetch commits
              try {
                const commitsData = await api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

                // Check if request was cancelled
                if (isCancelled) return

                const commitsCount = commitsData.commits?.length || 0
                userCommitsCount += commitsCount

                // Update chunk stats (team-level aggregation)
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    commits: (prev[chunkKey]?.commits || 0) + commitsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })

                // Update stats progressively
                if (!isCancelled) {
                  setMemberStats(prev => ({
                    ...prev,
                    [username]: {
                      ...prev[username],
                      commits: userCommitsCount,
                      total: (prev[username]?.prs || 0) + userCommitsCount + (prev[username]?.reviews || 0)
                    }
                  }))
                }
              } catch (err) {
                // Handle abort gracefully
                if (err.name === 'AbortError') {
                  console.log(`[TeamDetail] Commits request aborted for ${username}`)
                  return
                }
                console.error(`Error fetching commits for ${username}:`, err)
                counter.value++
                counter.errors++
                if (!isCancelled) {
                  setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })
                }
              }

              // Fetch reviews
              try {
                const reviewsData = await api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

                // Check if request was cancelled
                if (isCancelled) return

                const reviewsCount = reviewsData.reviews?.length || 0
                userReviewsCount += reviewsCount

                // Update chunk stats (team-level aggregation)
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    reviews: (prev[chunkKey]?.reviews || 0) + reviewsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                counter.value++
                setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })

                // Increment local chunk counter (after all 3 endpoints for this chunk)
                userLoadedChunks++

                // Update stats progressively
                if (!isCancelled) {
                  setMemberStats(prev => ({
                    ...prev,
                    [username]: {
                      ...prev[username],
                      reviews: userReviewsCount,
                      total: (prev[username]?.prs || 0) + (prev[username]?.commits || 0) + userReviewsCount,
                      loadedChunks: userLoadedChunks
                    }
                  }))
                }
              } catch (err) {
                // Handle abort gracefully
                if (err.name === 'AbortError') {
                  console.log(`[TeamDetail] Reviews request aborted for ${username}`)
                  return
                }
                console.error(`Error fetching reviews for ${username}:`, err)
                counter.value++
                counter.errors++
                if (!isCancelled) {
                  setFetchProgress({ loaded: counter.value, total: totalRequests, errors: counter.errors })
                  // Still increment local chunk counter on error (chunk is done, even if it failed)
                  userLoadedChunks++
                  setMemberStats(prev => ({
                    ...prev,
                    [username]: {
                      ...prev[username],
                      loadedChunks: userLoadedChunks
                    }
                  }))
                }
              }
            })
          )

          // Mark this member as loaded
          if (!isCancelled) {
            setMemberStats(prev => ({
              ...prev,
              [username]: {
                ...prev[username],
                loading: false
              }
            }))
          }
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
      const totalRequests = members.length * 3
      let completed = 0
      let errors = 0

      // Show progress
      setFetchProgress({ loaded: 0, total: totalRequests, errors: 0 })

      // Fetch latest chunk for all members in parallel
      await Promise.all(
        members.map(async (member) => {
          const username = member.login || member.username || member.name || member

          try {
            const [prsData, commitsData, reviewsData] = await Promise.all([
              api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
                completed++
                setFetchProgress({ loaded: completed, total: totalRequests, errors })
                return data
              }),
              api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
                completed++
                setFetchProgress({ loaded: completed, total: totalRequests, errors })
                return data
              }),
              api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
                completed++
                setFetchProgress({ loaded: completed, total: totalRequests, errors })
                return data
              })
            ])

            console.log(`[TeamDetail] Refreshed latest chunk for ${username}`)
          } catch (err) {
            console.error(`[TeamDetail] Error refreshing latest chunk for ${username}:`, err)
            // Still increment progress on error
            completed += 3
            errors += 3
            setFetchProgress({ loaded: completed, total: totalRequests, errors })
          }
        })
      )

      console.log('[TeamDetail] Latest chunk refreshed for all members, cache updated')
    } catch (err) {
      console.error('[TeamDetail] Error refreshing latest chunk:', err)
    } finally {
      setRefreshingLatest(false)
      // Clear progress after a brief delay
      setTimeout(() => {
        setFetchProgress({ loaded: 0, total: 0, errors: 0 })
      }, 500)
    }
  }

  // Filter PRs based on period (client-side filtering for 7 days)
  const filteredTeamPRs = useMemo(() => {
    if (period !== '7days') return teamPRs

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    return teamPRs.filter(pr => {
      const prDate = new Date(pr.createdAt)
      return prDate >= sevenDaysAgo
    })
  }, [teamPRs, period])

  // Group and sort team PRs by status, then by user (must be before early returns)
  const groupedTeamPRs = useMemo(() => {
    const groups = {
      open: {},
      merged: {},
      closed: {}
    }

    filteredTeamPRs.forEach(pr => {
      // Determine single status: Merged > Closed > Open
      let statusKey
      if (pr.mergedAt) {
        statusKey = 'merged'
      } else if (pr.state?.toLowerCase() === 'closed') {
        statusKey = 'closed'
      } else {
        statusKey = 'open'
      }

      // Group by user within each status
      const author = pr.author
      if (!groups[statusKey][author]) {
        groups[statusKey][author] = []
      }
      groups[statusKey][author].push(pr)
    })

    // Sort PRs within each user group by date (newest first)
    // And convert to sorted array of [author, prs] pairs sorted by PR count descending
    const result = {}
    Object.keys(groups).forEach(statusKey => {
      const userGroups = groups[statusKey]

      // Sort PRs within each user group
      Object.keys(userGroups).forEach(author => {
        userGroups[author].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      })

      // Convert to array and sort by PR count descending
      result[statusKey] = Object.entries(userGroups)
        .sort((a, b) => b[1].length - a[1].length) // Sort by PR count descending
    })

    return result
  }, [filteredTeamPRs])

  // Transform chunkStats into time-series chart data
  const timeSeriesChartData = useMemo(() => {
    let filteredChunks = Object.entries(chunkStats)

    // Apply 7-day filtering if period is 7days
    if (period === '7days') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      filteredChunks = filteredChunks.filter(([dateKey]) => {
        const chunkDate = new Date(dateKey)
        return chunkDate >= sevenDaysAgo
      })
    }

    return filteredChunks
      .map(([dateKey, stats]) => ({
        name: dateKey, // YYYY-MM-DD format
        PRs: stats.prs || 0,
        Commits: stats.commits || 0,
        Reviews: stats.reviews || 0,
        Total: (stats.prs || 0) + (stats.commits || 0) + (stats.reviews || 0)
      }))
      .sort((a, b) => a.name.localeCompare(b.name)) // Sort by date ascending (chronological)
  }, [chunkStats, period])

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

  // Calculate dynamic intervals for chart x-axis labels to prevent cluttering
  const timeSeriesInterval = useMemo(() => {
    const dataLength = timeSeriesChartData.length
    if (dataLength <= 12) return 0 // Show all labels for small datasets
    return Math.max(0, Math.floor(dataLength / 12) - 1) // Show ~12 labels
  }, [timeSeriesChartData])

  const memberChartInterval = useMemo(() => {
    const dataLength = chartData.length
    if (dataLength <= 15) return 0 // Show all labels for small datasets
    return Math.max(0, Math.floor(dataLength / 15) - 1) // Show ~15 labels
  }, [chartData])

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

  // Don't block rendering while team loads - show placeholder
  if (loading || !team) {
    return (
      <div className="team-detail-container">
        <Link to="/" className="back-link">← Back to Teams</Link>
        <div className="team-info">
          <LoadingSpinner message="Loading team details..." />
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

  const toggleUserSection = (statusKey, author) => {
    const key = `${statusKey}-${author}`
    setCollapsedUsers(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleExportTeamCache = async () => {
    try {
      // Get all IndexedDB cache entries
      const allEntries = await indexedDBCache.getAll()

      // Filter entries related to this team
      const teamEntries = allEntries.filter(entry => {
        // Include entries that contain the team slug in the key
        return entry.key.includes(`/teams/${teamSlug}`)
      })

      // Convert to object format for export
      const exportData = {}
      teamEntries.forEach(entry => {
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
      link.download = `team-${teamSlug}-cache-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log(`✅ Exported ${teamEntries.length} cache entries for team ${teamSlug}`)
    } catch (error) {
      console.error('Failed to export team cache:', error)
      alert('Failed to export cache. Check console for details.')
    }
  }

  const periodOptions = [
    { value: '7days', label: '7 Days' },
    { value: '30days', label: '30 Days' },
    { value: '90days', label: '90 Days' },
    { value: '365days', label: '365 Days' },
    { value: 'all-time', label: 'All Time' }
  ]

  const getPeriodLabel = () => {
    const option = periodOptions.find(opt => opt.value === period)
    return option ? option.label : '30 Days'
  }

  // Calculate member count from team data
  const memberCount = team?.memberCount ?? team?.members?.length ?? 0

  const tabs = [
    { id: 'prs', label: `PRs (${filteredTeamPRs.length})` },
    { id: 'members', label: `Members (${memberCount})` },
    { id: 'contributions', label: 'Contributions' }
  ]

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
            {abortController && (
              <button
                onClick={handleCancelRequests}
                className="progress-cancel-icon"
                title="Cancel all pending requests"
              >
                ✕
              </button>
            )}
          </div>
          <div className="progress-text">
            <span className="progress-main">
              {fetchProgress.loaded} of {fetchProgress.total} completed
              ({Math.round((fetchProgress.loaded / fetchProgress.total) * 100)}%)
              {queueStats.active > 0 && <> • {queueStats.active} in progress</>}
              {queueStats.queued > 0 && <> • {queueStats.queued} queued</>}
            </span>
            {fetchProgress.errors > 0 && (
              <span className="error-count"> • {fetchProgress.errors} failed</span>
            )}
          </div>
        </div>
      )}

      <div className="team-info">
        <div className="header-with-export">
          <h2>{team?.name || teamSlug}</h2>
          <button
            onClick={handleExportTeamCache}
            className="export-button-inline"
            title="Export cached data for this team"
          >
            ⬇ Export Cache
          </button>
        </div>
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

        {/* Tabs Navigation */}
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Contributions Tab */}
        {activeTab === 'contributions' && (
          <>
            {/* Per-Member Contributions Chart */}
            {chartData.length > 0 && (
              <div className="contributions-chart-section">
                <div className="chart-header">
                  <h3>Contributions by Team Member</h3>
                  <div className="chart-controls">
                    <div className="chart-view-toggle">
                      <button
                        onClick={() => setIsStacked(!isStacked)}
                        className={`toggle-button ${!isStacked ? 'toggle-button-active' : ''}`}
                      >
                        Grouped
                      </button>
                    </div>
                    <div className="series-toggles">
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.prs}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, prs: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#0969da' }}>PRs</span>
                      </label>
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.commits}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, commits: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#2da44e' }}>Commits</span>
                      </label>
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.reviews}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, reviews: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#bf3989' }}>Reviews</span>
                      </label>
                    </div>
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
                      interval={memberChartInterval}
                      style={{ fontSize: '0.75rem' }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {visibleSeries.prs && (
                      <Bar
                        dataKey="PRs"
                        fill="#0969da"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                    {visibleSeries.commits && (
                      <Bar
                        dataKey="Commits"
                        fill="#2da44e"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                    {visibleSeries.reviews && (
                      <Bar
                        dataKey="Reviews"
                        fill="#bf3989"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Time-Series Contributions Chart */}
            {timeSeriesChartData.length > 0 && (
              <div className="contributions-chart-section">
                <div className="chart-header">
                  <h3>Team Contributions Over Time</h3>
                  <div className="chart-controls">
                    <div className="chart-view-toggle">
                      <button
                        onClick={() => setIsStacked(!isStacked)}
                        className={`toggle-button ${!isStacked ? 'toggle-button-active' : ''}`}
                      >
                        Grouped
                      </button>
                    </div>
                    <div className="series-toggles">
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.prs}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, prs: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#0969da' }}>PRs</span>
                      </label>
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.commits}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, commits: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#2da44e' }}>Commits</span>
                      </label>
                      <label className="series-toggle">
                        <input
                          type="checkbox"
                          checked={visibleSeries.reviews}
                          onChange={(e) => setVisibleSeries(prev => ({ ...prev, reviews: e.target.checked }))}
                        />
                        <span className="series-label" style={{ color: '#bf3989' }}>Reviews</span>
                      </label>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={timeSeriesChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval={timeSeriesInterval}
                      style={{ fontSize: '0.75rem' }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {visibleSeries.prs && (
                      <Bar
                        dataKey="PRs"
                        fill="#0969da"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                    {visibleSeries.commits && (
                      <Bar
                        dataKey="Commits"
                        fill="#2da44e"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                    {visibleSeries.reviews && (
                      <Bar
                        dataKey="Reviews"
                        fill="#bf3989"
                        stackId={isStacked ? 'stack' : undefined}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && sortedMembers.length > 0 && (
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
                            width: `${stats.totalChunks > 0 ? (stats.loadedChunks / stats.totalChunks) * 100 : 0}%`
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

        {/* PRs Tab */}
        {activeTab === 'prs' && filteredTeamPRs.length > 0 && (
          <div className="team-prs-section">
            <h3>Team Pull Requests ({filteredTeamPRs.length})</h3>

            {/* Open PRs */}
            {groupedTeamPRs.open.length > 0 && (
              <div className="pr-status-group">
                <button
                  className="pr-group-header"
                  onClick={() => toggleSection('open')}
                >
                  <span className="pr-group-title">
                    Open ({groupedTeamPRs.open.reduce((sum, [_, prs]) => sum + prs.length, 0)})
                  </span>
                  <span className={`expand-icon ${collapsedSections.open ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.open && (
                  <div className="user-grouped-prs">
                    {groupedTeamPRs.open.map(([author, prs]) => {
                      const userKey = `open-${author}`
                      const isExpanded = !collapsedUsers[userKey]
                      return (
                        <div key={author} className="user-pr-group">
                          <button
                            className="user-pr-header"
                            onClick={() => toggleUserSection('open', author)}
                          >
                            <div className="user-pr-header-content">
                              <Link to={`/user/${author}`} className="user-pr-author" onClick={(e) => e.stopPropagation()}>
                                @{author}
                              </Link>
                              <span className="user-pr-count">{prs.length}</span>
                            </div>
                            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                          </button>
                          {isExpanded && (
                            <div className="team-prs-list">
                              {prs.map((pr) => (
                                <div key={pr.id} className="team-pr-card">
                                  <span className="pr-repo">{pr.repository}</span>
                                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                                    {pr.title}
                                  </a>
                                  <span className="status-badge status-open">Open</span>
                                  {pr.draft && <span className="meta-badge draft">Draft</span>}
                                  <span className="pr-number">#{pr.number}</span>
                                  <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
                    Merged ({groupedTeamPRs.merged.reduce((sum, [_, prs]) => sum + prs.length, 0)})
                  </span>
                  <span className={`expand-icon ${collapsedSections.merged ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.merged && (
                  <div className="user-grouped-prs">
                    {groupedTeamPRs.merged.map(([author, prs]) => {
                      const userKey = `merged-${author}`
                      const isExpanded = !collapsedUsers[userKey]
                      return (
                        <div key={author} className="user-pr-group">
                          <button
                            className="user-pr-header"
                            onClick={() => toggleUserSection('merged', author)}
                          >
                            <div className="user-pr-header-content">
                              <Link to={`/user/${author}`} className="user-pr-author" onClick={(e) => e.stopPropagation()}>
                                @{author}
                              </Link>
                              <span className="user-pr-count">{prs.length}</span>
                            </div>
                            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                          </button>
                          {isExpanded && (
                            <div className="team-prs-list">
                              {prs.map((pr) => (
                                <div key={pr.id} className="team-pr-card">
                                  <span className="pr-repo">{pr.repository}</span>
                                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                                    {pr.title}
                                  </a>
                                  <span className="status-badge status-merged">Merged</span>
                                  <span className="pr-number">#{pr.number}</span>
                                  <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
                    Closed ({groupedTeamPRs.closed.reduce((sum, [_, prs]) => sum + prs.length, 0)})
                  </span>
                  <span className={`expand-icon ${collapsedSections.closed ? '' : 'expanded'}`}>▼</span>
                </button>
                {!collapsedSections.closed && (
                  <div className="user-grouped-prs">
                    {groupedTeamPRs.closed.map(([author, prs]) => {
                      const userKey = `closed-${author}`
                      const isExpanded = !collapsedUsers[userKey]
                      return (
                        <div key={author} className="user-pr-group">
                          <button
                            className="user-pr-header"
                            onClick={() => toggleUserSection('closed', author)}
                          >
                            <div className="user-pr-header-content">
                              <Link to={`/user/${author}`} className="user-pr-author" onClick={(e) => e.stopPropagation()}>
                                @{author}
                              </Link>
                              <span className="user-pr-count">{prs.length}</span>
                            </div>
                            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
                          </button>
                          {isExpanded && (
                            <div className="team-prs-list">
                              {prs.map((pr) => (
                                <div key={pr.id} className="team-pr-card">
                                  <span className="pr-repo">{pr.repository}</span>
                                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-title">
                                    {pr.title}
                                  </a>
                                  <span className="status-badge status-closed">Closed</span>
                                  <span className="pr-number">#{pr.number}</span>
                                  <span className="pr-date">{new Date(pr.createdAt).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
