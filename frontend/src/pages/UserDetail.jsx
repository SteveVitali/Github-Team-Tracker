import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { chunkDateRange, getDateRangeForPeriod, formatDateISO, getChunkStart, getChunkEnd } from '../utils/dateChunking'
import './UserDetail.css'

export function UserDetail() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [userInfo, setUserInfo] = useState({ username, name: username })
  const [prs, setPrs] = useState({ prs: [], count: 0 })
  const [commits, setCommits] = useState({ commits: [], count: 0 })
  const [reviews, setReviews] = useState({ reviews: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('prs')
  const [period, setPeriod] = useState('30days')
  const [fetchProgress, setFetchProgress] = useState({ loaded: 0, total: 0 })
  const [refreshingLatest, setRefreshingLatest] = useState(false)

  useEffect(() => {
    const fetchUserData = async () => {
      console.log('[UserDetail] Starting fetchUserData for', username, 'period:', period)
      setLoading(true)
      setError(null)

      // Reset data
      setPrs({ prs: [], count: 0 })
      setCommits({ commits: [], count: 0 })
      setReviews({ reviews: [], count: 0 })

      try {
        // Get date range for the selected period
        console.log('[UserDetail] Getting date range for period:', period)
        const { from, to } = getDateRangeForPeriod(period)
        console.log('[UserDetail] Date range:', from, 'to', to)

        // Chunk the date range into weekly segments
        const chunks = chunkDateRange(from, to)

        console.log(`Date range: ${from.toISOString()} to ${to.toISOString()}`)
        console.log(`Number of chunks: ${chunks.length}`)

        // Safety check: if too many chunks, bail out
        if (chunks.length > 100) {
          throw new Error(`Too many date chunks (${chunks.length}). This would create too many API requests.`)
        }

        setFetchProgress({ loaded: 0, total: chunks.length * 3 }) // 3 endpoints per chunk

        // Fetch all chunks in parallel with progress tracking
        const allPrs = []
        const allCommits = []
        const allReviews = []

        // Use a counter object to avoid race conditions
        const counter = { value: 0 }

        // Process chunks in parallel
        await Promise.all(
          chunks.map(async (chunk) => {
            const fromStr = formatDateISO(chunk.from)
            const toStr = formatDateISO(chunk.to)

            try {
              // Fetch PRs for this chunk
              const prsData = await api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`)

              // Safety check for pagination limit
              if (prsData.prs && prsData.prs.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! PR endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              allPrs.push(...(prsData.prs || []))
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })

              // Progressively update UI with partial results (deduplicate by ID)
              setPrs(prev => {
                const existingIds = new Set(prev.prs.map(pr => pr.id))
                const newPrs = (prsData.prs || []).filter(pr => !existingIds.has(pr.id))
                return {
                  prs: [...prev.prs, ...newPrs],
                  count: prev.prs.length + newPrs.length
                }
              })
            } catch (err) {
              console.error(`Error fetching PRs for ${fromStr} to ${toStr}:`, err)
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })
            }

            try {
              // Fetch commits for this chunk
              const commitsData = await api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`)

              // Safety check for pagination limit
              if (commitsData.commits && commitsData.commits.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Commits endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              allCommits.push(...(commitsData.commits || []))
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })

              // Progressively update UI (deduplicate by SHA)
              setCommits(prev => {
                const existingShas = new Set(prev.commits.map(c => c.sha))
                const newCommits = (commitsData.commits || []).filter(c => !existingShas.has(c.sha))
                return {
                  commits: [...prev.commits, ...newCommits],
                  count: prev.commits.length + newCommits.length
                }
              })
            } catch (err) {
              console.error(`Error fetching commits for ${fromStr} to ${toStr}:`, err)
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })
            }

            try {
              // Fetch reviews for this chunk
              const reviewsData = await api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`)

              // Safety check for pagination limit
              if (reviewsData.reviews && reviewsData.reviews.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Reviews endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              allReviews.push(...(reviewsData.reviews || []))
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })

              // Progressively update UI (deduplicate by ID)
              setReviews(prev => {
                const existingIds = new Set(prev.reviews.map(r => r.id))
                const newReviews = (reviewsData.reviews || []).filter(r => !existingIds.has(r.id))
                return {
                  reviews: [...prev.reviews, ...newReviews],
                  count: prev.reviews.length + newReviews.length
                }
              })
            } catch (err) {
              console.error(`Error fetching reviews for ${fromStr} to ${toStr}:`, err)
              counter.value++
              setFetchProgress({ loaded: counter.value, total: chunks.length * 3 })
            }
          })
        )

        // Set user info
        setUserInfo({
          username,
          name: username,
        })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [username, period])

  const refreshLatestChunk = async () => {
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

      console.log(`[UserDetail] Refreshing latest chunk: ${fromStr} to ${toStr}`)

      // Fetch latest chunk data with cache bypass
      const [prsData, commitsData, reviewsData] = await Promise.all([
        api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { bypassCache: true }),
        api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { bypassCache: true }),
        api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { bypassCache: true })
      ])

      // Update state with deduplication (prevents double-counting)
      setPrs(prev => {
        const existingIds = new Set(prev.prs.map(pr => pr.id))
        const newPrs = (prsData.prs || []).filter(pr => !existingIds.has(pr.id))
        return {
          prs: [...prev.prs, ...newPrs],
          count: prev.prs.length + newPrs.length
        }
      })

      setCommits(prev => {
        const existingShas = new Set(prev.commits.map(c => c.sha))
        const newCommits = (commitsData.commits || []).filter(c => !existingShas.has(c.sha))
        return {
          commits: [...prev.commits, ...newCommits],
          count: prev.commits.length + newCommits.length
        }
      })

      setReviews(prev => {
        const existingIds = new Set(prev.reviews.map(r => r.id))
        const newReviews = (reviewsData.reviews || []).filter(r => !existingIds.has(r.id))
        return {
          reviews: [...prev.reviews, ...newReviews],
          count: prev.reviews.length + newReviews.length
        }
      })

      console.log('[UserDetail] Latest chunk refreshed successfully')
    } catch (err) {
      console.error('[UserDetail] Error refreshing latest chunk:', err)
    } finally {
      setRefreshingLatest(false)
    }
  }

  if (error) {
    return (
      <div className="user-detail-container">
        <button onClick={() => navigate(-1)} className="back-button">← Back</button>
        <div className="error-container">
          <h3>Error loading user stats</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'prs', label: 'Pull Requests', count: prs?.count },
    { id: 'commits', label: 'Commits', count: commits?.count },
    { id: 'reviews', label: 'Reviews', count: reviews?.count }
  ]

  const periodOptions = [
    { value: '30days', label: '30 Days' },
    { value: '90days', label: '90 Days' },
    { value: '365days', label: '365 Days' },
    { value: 'all-time', label: 'All Time' }
  ]

  // Component for grouping items by repository
  function RepositoryGroupedList({ items, type }) {
    const [expandedRepos, setExpandedRepos] = useState({})

    // Group items by repository
    const groupedByRepo = items.reduce((acc, item) => {
      const repo = type === 'commit' ? item.repository.name : item.repository
      if (!acc[repo]) {
        acc[repo] = []
      }
      acc[repo].push(item)
      return acc
    }, {})

    // Sort repos by count (descending)
    const sortedRepos = Object.entries(groupedByRepo).sort((a, b) => b[1].length - a[1].length)

    // Sort items within each repo (for PRs: open first, then closed)
    sortedRepos.forEach(([repo, repoItems]) => {
      if (type === 'pr') {
        repoItems.sort((a, b) => {
          // Open PRs first
          if (a.state.toLowerCase() === 'open' && b.state.toLowerCase() !== 'open') return -1
          if (a.state.toLowerCase() !== 'open' && b.state.toLowerCase() === 'open') return 1
          // Then sort by date (newest first)
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
      } else if (type === 'commit') {
        // Sort commits by date (newest first)
        repoItems.sort((a, b) => new Date(b.author.date) - new Date(a.author.date))
      } else if (type === 'review') {
        // Sort reviews: open PRs first, then by date
        repoItems.sort((a, b) => {
          if (a.state.toLowerCase() === 'open' && b.state.toLowerCase() !== 'open') return -1
          if (a.state.toLowerCase() !== 'open' && b.state.toLowerCase() === 'open') return 1
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
      }
    })

    const toggleRepo = (repo) => {
      setExpandedRepos(prev => ({
        ...prev,
        [repo]: !prev[repo]
      }))
    }

    return (
      <div className="repo-grouped-list">
        {sortedRepos.map(([repo, repoItems]) => {
          const isExpanded = expandedRepos[repo] ?? false
          return (
            <div key={repo} className="repo-section">
              <button
                className="repo-header"
                onClick={() => toggleRepo(repo)}
              >
                <div className="repo-header-content">
                  <span className="repo-name">{repo}</span>
                  <span className="repo-count">{repoItems.length}</span>
                </div>
                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
              </button>

              {isExpanded && (
                <div className="repo-items">
                  {repoItems.map((item) => {
                    if (type === 'pr') {
                      return (
                        <div key={item.id} className="item-card">
                          <div className="item-header">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-title">
                              {item.title}
                            </a>
                            <span className={`status-badge status-${item.state.toLowerCase()}`}>
                              {item.state}
                            </span>
                          </div>
                          <div className="item-meta">
                            <span className="meta-item">#{item.number}</span>
                            <span className="meta-item">{new Date(item.createdAt).toLocaleDateString()}</span>
                            {item.mergedAt && <span className="meta-badge merged">Merged</span>}
                            {item.draft && <span className="meta-badge draft">Draft</span>}
                          </div>
                        </div>
                      )
                    } else if (type === 'commit') {
                      return (
                        <div key={item.sha} className="item-card">
                          <div className="item-header">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-title">
                              {item.message.split('\n')[0]}
                            </a>
                          </div>
                          <div className="item-meta">
                            <span className="meta-item">{new Date(item.author.date).toLocaleDateString()}</span>
                            <span className="meta-item code">{item.sha.substring(0, 7)}</span>
                          </div>
                        </div>
                      )
                    } else if (type === 'review') {
                      return (
                        <div key={item.id} className="item-card">
                          <div className="item-header">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-title">
                              {item.title}
                            </a>
                            <span className={`status-badge status-${item.state.toLowerCase()}`}>
                              {item.state}
                            </span>
                          </div>
                          <div className="item-meta">
                            <span className="meta-item">#{item.number}</span>
                            <span className="meta-item">{new Date(item.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="user-detail-container">
      <button onClick={() => navigate(-1)} className="back-button">← Back</button>

      {/* Progress bar at the top */}
      {loading && fetchProgress.total > 0 && (
        <div className="fetch-progress-top">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${(fetchProgress.loaded / fetchProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            Loading: {fetchProgress.loaded} of {fetchProgress.total} requests completed
            ({Math.round((fetchProgress.loaded / fetchProgress.total) * 100)}%)
          </div>
        </div>
      )}

      <div className="user-header">
        <div className="user-avatar">
          <div className="avatar-placeholder">{username.charAt(0).toUpperCase()}</div>
        </div>
        <div className="user-info">
          <h2>{userInfo?.name || username}</h2>
          <p className="username">@{username}</p>
        </div>
      </div>

      <div className="time-range-selector">
        <label htmlFor="period-select" className="time-range-label">Time Range:</label>
        <div className="days-buttons">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`day-button ${period === option.value ? 'day-button-active' : ''}`}
              disabled={loading && fetchProgress.total > 0}
            >
              {option.label}
            </button>
          ))}
          <button
            onClick={refreshLatestChunk}
            className="refresh-button"
            disabled={refreshingLatest || (loading && fetchProgress.total > 0)}
            title="Refresh latest data (bypasses cache)"
          >
            {refreshingLatest ? '↻ Refreshing...' : '↻ Refresh Latest'}
          </button>
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-value">{prs?.count || 0}</div>
          <div className="summary-label">Pull Requests</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{commits?.count || 0}</div>
          <div className="summary-label">Commits</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{reviews?.count || 0}</div>
          <div className="summary-label">Reviews</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} {tab.count !== undefined && `(${tab.count})`}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'prs' && (
          <div className="prs-list">
            {prs?.prs && prs.prs.length > 0 ? (
              <RepositoryGroupedList
                items={prs.prs}
                type="pr"
              />
            ) : (
              <div className="empty-state">No pull requests found for the selected time period</div>
            )}
          </div>
        )}

        {activeTab === 'commits' && (
          <div className="commits-list">
            {commits?.commits && commits.commits.length > 0 ? (
              <RepositoryGroupedList
                items={commits.commits}
                type="commit"
              />
            ) : (
              <div className="empty-state">No commits found for the selected time period</div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="reviews-list">
            {reviews?.reviews && reviews.reviews.length > 0 ? (
              <RepositoryGroupedList
                items={reviews.reviews}
                type="review"
              />
            ) : (
              <div className="empty-state">No reviews found for the selected time period</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
