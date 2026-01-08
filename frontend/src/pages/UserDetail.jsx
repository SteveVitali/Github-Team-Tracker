import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { indexedDBCache } from '../indexeddb-cache'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { chunkDateRange, getDateRangeForPeriod, formatDateISO, getChunkStart, getChunkEnd } from '../utils/dateChunking'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './UserDetail.css'

export function UserDetail() {
  const { username } = useParams()
  const [userInfo, setUserInfo] = useState({ username, name: username })
  const [prs, setPrs] = useState({ prs: [], count: 0 })
  const [commits, setCommits] = useState({ commits: [], count: 0 })
  const [reviews, setReviews] = useState({ reviews: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Initialize activeTab from localStorage for this specific user
  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem(`user-tab-${username}`)
    return stored || 'prs'
  })

  // Initialize period from localStorage for this specific user
  const [period, setPeriod] = useState(() => {
    const stored = localStorage.getItem(`user-period-${username}`)
    return stored || '7days'
  })

  const [fetchProgress, setFetchProgress] = useState({ loaded: 0, total: 0, errors: 0 })
  const [queueStats, setQueueStats] = useState({ active: 0, queued: 0, total: 0 })
  const [refreshingLatest, setRefreshingLatest] = useState(false)
  const [abortController, setAbortController] = useState(null)
  const [chunkStats, setChunkStats] = useState({}) // { 'YYYY-MM-DD': { prs: N, commits: N, reviews: N } }
  const [isStacked, setIsStacked] = useState(true)
  const [visibleSeries, setVisibleSeries] = useState({ prs: true, commits: true, reviews: true })

  // Handler to cancel ongoing requests
  const handleCancelRequests = () => {
    if (abortController) {
      console.log('[UserDetail] User cancelled requests')
      abortController.abort()
      // Clear the period selection to reset the UI
      setPeriod('')
      // Reset progress
      setFetchProgress({ loaded: 0, total: 0, errors: 0 })
    }
  }

  // Save period to localStorage whenever it changes for this user
  useEffect(() => {
    localStorage.setItem(`user-period-${username}`, period)
  }, [username, period])

  // Save activeTab to localStorage whenever it changes for this user
  useEffect(() => {
    localStorage.setItem(`user-tab-${username}`, activeTab)
  }, [username, activeTab])

  useEffect(() => {
    // Subscribe to global queue stats
    const unsubscribe = api.onStatsChange((newStats) => {
      setQueueStats(newStats)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    // Create AbortController for this fetch cycle
    const controller = new AbortController()
    setAbortController(controller)
    let isCancelled = false

    const fetchUserData = async () => {
      console.log('[UserDetail] Starting fetchUserData for', username, 'period:', period)
      setLoading(true)
      setError(null)

      // Reset data
      setPrs({ prs: [], count: 0 })
      setCommits({ commits: [], count: 0 })
      setReviews({ reviews: [], count: 0 })
      setChunkStats({})

      try {
        // Get date range for the selected period
        console.log('[UserDetail] Getting date range for period:', period)
        const { from, to } = getDateRangeForPeriod(period)
        console.log('[UserDetail] Date range:', from, 'to', to)

        // Chunk the date range into segments
        const chunks = chunkDateRange(from, to)

        console.log(`Date range: ${from.toISOString()} to ${to.toISOString()}`)
        console.log(`Number of chunks: ${chunks.length}`)

        // Safety check: if too many chunks, bail out
        if (chunks.length > 100 && period !== 'all-time') {
          throw new Error(`Too many date chunks (${chunks.length}). This would create too many API requests.`)
        }

        // For all-time queries, process chunks sequentially from newest to oldest
        // Stop when we hit N consecutive empty chunks
        const EMPTY_CHUNK_THRESHOLD = 3

        if (period === 'all-time') {
          // Reverse chunks to go from newest to oldest
          const reversedChunks = [...chunks].reverse()
          let consecutiveEmptyChunks = 0
          let processedChunks = 0

          setFetchProgress({ loaded: 0, total: reversedChunks.length * 3, errors: 0 })

          for (const chunk of reversedChunks) {
            if (consecutiveEmptyChunks >= EMPTY_CHUNK_THRESHOLD) {
              console.log(`[UserDetail] Stopping all-time fetch: ${EMPTY_CHUNK_THRESHOLD} consecutive empty chunks detected`)
              break
            }

            const fromStr = formatDateISO(chunk.from)
            const toStr = formatDateISO(chunk.to)

            let chunkPrsCount = 0
            let chunkCommitsCount = 0
            let chunkReviewsCount = 0

            try {
              const prsData = await api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) break

              if (prsData.prs && prsData.prs.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! PR endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }
              chunkPrsCount = (prsData.prs || []).length
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
              }

              const chunkKey = fromStr
              if (!isCancelled) {
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    prs: chunkPrsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                setPrs(prev => {
                  const existingIds = new Set(prev.prs.map(pr => pr.id))
                  const newPrs = (prsData.prs || []).filter(pr => !existingIds.has(pr.id))
                  return {
                    prs: [...prev.prs, ...newPrs],
                    count: prev.prs.length + newPrs.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                break
              }
              console.error(`Error fetching PRs for ${fromStr} to ${toStr}:`, err)
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1, errors: prev.errors + 1 }))
              }
            }

            try {
              const commitsData = await api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) break

              if (commitsData.commits && commitsData.commits.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Commits endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }
              chunkCommitsCount = (commitsData.commits || []).length
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
              }

              const chunkKey = fromStr
              if (!isCancelled) {
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    commits: chunkCommitsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                setCommits(prev => {
                  const existingShas = new Set(prev.commits.map(c => c.sha))
                  const newCommits = (commitsData.commits || []).filter(c => !existingShas.has(c.sha))
                  return {
                    commits: [...prev.commits, ...newCommits],
                    count: prev.commits.length + newCommits.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                break
              }
              console.error(`Error fetching commits for ${fromStr} to ${toStr}:`, err)
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1, errors: prev.errors + 1 }))
              }
            }

            try {
              const reviewsData = await api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) break

              if (reviewsData.reviews && reviewsData.reviews.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Reviews endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }
              chunkReviewsCount = (reviewsData.reviews || []).length
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
              }

              const chunkKey = fromStr
              if (!isCancelled) {
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    reviews: chunkReviewsCount,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                setReviews(prev => {
                  const existingIds = new Set(prev.reviews.map(r => r.id))
                  const newReviews = (reviewsData.reviews || []).filter(r => !existingIds.has(r.id))
                  return {
                    reviews: [...prev.reviews, ...newReviews],
                    count: prev.reviews.length + newReviews.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                break
              }
              console.error(`Error fetching reviews for ${fromStr} to ${toStr}:`, err)
              if (!isCancelled) {
                setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1, errors: prev.errors + 1 }))
              }
            }

            // Check if this chunk was empty
            const chunkTotal = chunkPrsCount + chunkCommitsCount + chunkReviewsCount
            if (chunkTotal === 0) {
              consecutiveEmptyChunks++
              console.log(`[UserDetail] Empty chunk ${fromStr} to ${toStr} (${consecutiveEmptyChunks}/${EMPTY_CHUNK_THRESHOLD})`)
            } else {
              consecutiveEmptyChunks = 0 // Reset counter when we find contributions
            }

            processedChunks++
          }

          console.log(`[UserDetail] All-time fetch complete: processed ${processedChunks}/${reversedChunks.length} chunks`)
        } else {
          // For non-all-time periods, fetch all chunks in parallel
          setFetchProgress({ loaded: 0, total: chunks.length * 3, errors: 0 })

          // Use a counter object to avoid race conditions
          const counter = { value: 0, errors: 0 }

          // Process chunks in parallel
          await Promise.all(
            chunks.map(async (chunk) => {
            const fromStr = formatDateISO(chunk.from)
            const toStr = formatDateISO(chunk.to)

            try {
              // Fetch PRs for this chunk
              const prsData = await api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) return

              // Safety check for pagination limit
              if (prsData.prs && prsData.prs.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! PR endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              counter.value++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })

                // Update chunk stats
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    prs: (prsData.prs || []).length,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                // Progressively update UI with partial results (deduplicate by ID)
                setPrs(prev => {
                  const existingIds = new Set(prev.prs.map(pr => pr.id))
                  const newPrs = (prsData.prs || []).filter(pr => !existingIds.has(pr.id))
                  return {
                    prs: [...prev.prs, ...newPrs],
                    count: prev.prs.length + newPrs.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                return
              }
              console.error(`Error fetching PRs for ${fromStr} to ${toStr}:`, err)
              counter.value++
              counter.errors++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })
              }
            }

            try {
              // Fetch commits for this chunk
              const commitsData = await api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) return

              // Safety check for pagination limit
              if (commitsData.commits && commitsData.commits.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Commits endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              counter.value++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })

                // Update chunk stats
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    commits: (commitsData.commits || []).length,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                // Progressively update UI (deduplicate by SHA)
                setCommits(prev => {
                  const existingShas = new Set(prev.commits.map(c => c.sha))
                  const newCommits = (commitsData.commits || []).filter(c => !existingShas.has(c.sha))
                  return {
                    commits: [...prev.commits, ...newCommits],
                    count: prev.commits.length + newCommits.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                return
              }
              console.error(`Error fetching commits for ${fromStr} to ${toStr}:`, err)
              counter.value++
              counter.errors++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })
              }
            }

            try {
              // Fetch reviews for this chunk
              const reviewsData = await api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { signal: controller.signal })

              // Check if request was cancelled
              if (isCancelled) return

              // Safety check for pagination limit
              if (reviewsData.reviews && reviewsData.reviews.length === 100) {
                console.error(`🚨 PAGINATION LIMIT HIT! Reviews endpoint returned exactly 100 items for ${username} (${fromStr} to ${toStr}). Chunk size may be too large!`)
              }

              counter.value++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })

                // Update chunk stats
                const chunkKey = fromStr
                setChunkStats(prev => ({
                  ...prev,
                  [chunkKey]: {
                    ...prev[chunkKey],
                    reviews: (reviewsData.reviews || []).length,
                    from: chunk.from,
                    to: chunk.to
                  }
                }))

                // Progressively update UI (deduplicate by ID)
                setReviews(prev => {
                  const existingIds = new Set(prev.reviews.map(r => r.id))
                  const newReviews = (reviewsData.reviews || []).filter(r => !existingIds.has(r.id))
                  return {
                    reviews: [...prev.reviews, ...newReviews],
                    count: prev.reviews.length + newReviews.length
                  }
                })
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.log('[UserDetail] Request aborted')
                return
              }
              console.error(`Error fetching reviews for ${fromStr} to ${toStr}:`, err)
              counter.value++
              counter.errors++
              if (!isCancelled) {
                setFetchProgress({ loaded: counter.value, total: chunks.length * 3, errors: counter.errors })
              }
            }
          })
        )
      }

      // Set user info
      setUserInfo({
        username,
        name: username,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setFetchProgress({ loaded: 0, total: 0, errors: 0 })
    }
  }

    fetchUserData()

    // Cleanup function to abort ongoing requests when period changes
    return () => {
      console.log('[UserDetail] Aborting previous fetch cycle')
      isCancelled = true
      controller.abort()
      setAbortController(null)
    }
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

      // Show progress
      setFetchProgress({ loaded: 0, total: 3, errors: 0 })

      // Fetch latest chunk data with cache bypass
      const [prsData, commitsData, reviewsData] = await Promise.all([
        api.get(`/contributions/user/${username}/prs?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
          setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
          return data
        }),
        api.get(`/contributions/user/${username}/commits?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
          setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
          return data
        }),
        api.get(`/contributions/user/${username}/reviews?from=${fromStr}&to=${toStr}`, { bypassCache: true }).then(data => {
          setFetchProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }))
          return data
        })
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
      // Clear progress after a brief delay
      setTimeout(() => {
        setFetchProgress({ loaded: 0, total: 0, errors: 0 })
      }, 500)
    }
  }

  const handleExportUserCache = async () => {
    try {
      // Get all IndexedDB cache entries
      const allEntries = await indexedDBCache.getAll()

      // Filter entries related to this user
      const userEntries = allEntries.filter(entry => {
        // Include entries that contain the username in the key
        return entry.key.includes(`/user/${username}`) || entry.key.includes(`/${username}/`)
      })

      // Convert to object format for export
      const exportData = {}
      userEntries.forEach(entry => {
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
      link.download = `user-${username}-cache-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log(`✅ Exported ${userEntries.length} cache entries for user ${username}`)
    } catch (error) {
      console.error('Failed to export user cache:', error)
      alert('Failed to export cache. Check console for details.')
    }
  }

  // Transform chunk stats into time-series chart data
  const chartData = useMemo(() => {
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

  // Calculate dynamic interval for chart x-axis labels to prevent cluttering
  const chartInterval = useMemo(() => {
    const dataLength = chartData.length
    if (dataLength <= 12) return 0 // Show all labels for small datasets
    return Math.max(0, Math.floor(dataLength / 12) - 1) // Show ~12 labels
  }, [chartData])

  if (error) {
    return (
      <div className="user-detail-container">
        <Link to="/" className="back-link">← Back to Teams</Link>
        <div className="error-container">
          <h3>Error loading user stats</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const periodOptions = [
    { value: '7days', label: '7 Days' },
    { value: '30days', label: '30 Days' },
    { value: '90days', label: '90 Days' },
    { value: '365days', label: '365 Days' },
    { value: 'all-time', label: 'All Time' }
  ]

  // Filter data based on period (client-side filtering for 7 days)
  const filterByPeriod = (items, dateField) => {
    if (period !== '7days') return items

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    return items.filter(item => {
      const itemDate = new Date(item[dateField])
      return itemDate >= sevenDaysAgo
    })
  }

  // Apply filtering to data
  const filteredPrs = useMemo(() => ({
    prs: filterByPeriod(prs.prs || [], 'createdAt'),
    count: filterByPeriod(prs.prs || [], 'createdAt').length
  }), [prs, period])

  const filteredCommits = useMemo(() => ({
    commits: filterByPeriod(commits.commits || [], 'author.date'),
    count: filterByPeriod(commits.commits || [], 'author.date').length
  }), [commits, period])

  const filteredReviews = useMemo(() => ({
    reviews: filterByPeriod(reviews.reviews || [], 'createdAt'),
    count: filterByPeriod(reviews.reviews || [], 'createdAt').length
  }), [reviews, period])

  const tabs = [
    { id: 'prs', label: 'Pull Requests', count: filteredPrs?.count },
    { id: 'commits', label: 'Commits', count: filteredCommits?.count },
    { id: 'reviews', label: 'Reviews', count: filteredReviews?.count }
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
                      // Determine the actual status: if mergedAt exists, it's merged, not just closed
                      const prStatus = item.mergedAt ? 'merged' : item.state.toLowerCase()
                      const prStatusLabel = item.mergedAt ? 'Merged' : item.state

                      return (
                        <div key={item.id} className="item-card">
                          <div className="item-header">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-title">
                              {item.title}
                            </a>
                            <span className={`status-badge status-${prStatus}`}>
                              {prStatusLabel}
                            </span>
                          </div>
                          <div className="item-meta">
                            <span className="meta-item">#{item.number}</span>
                            <span className="meta-item">{new Date(item.createdAt).toLocaleDateString()}</span>
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
                      // Determine the actual status: if mergedAt exists, it's merged, not just closed
                      const reviewStatus = item.mergedAt ? 'merged' : item.state.toLowerCase()
                      const reviewStatusLabel = item.mergedAt ? 'Merged' : item.state

                      return (
                        <div key={item.id} className="item-card">
                          <div className="item-header">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-title">
                              {item.title}
                            </a>
                            <span className={`status-badge status-${reviewStatus}`}>
                              {reviewStatusLabel}
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
      <Link to="/" className="back-link">← Back to Teams</Link>

      {/* Progress bar at the top */}
      {fetchProgress.total > 0 && (
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

      <div className="user-header">
        <div className="user-avatar">
          <div className="avatar-placeholder">{username.charAt(0).toUpperCase()}</div>
        </div>
        <div className="user-info">
          <div className="header-with-export">
            <div>
              <h2>{userInfo?.name || username}</h2>
              <p className="username">@{username}</p>
            </div>
            <button
              onClick={handleExportUserCache}
              className="export-button-inline"
              title="Export cached data for this user"
            >
              ⬇ Export
            </button>
          </div>
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

      {/* Contributions Over Time Chart */}
      {chartData.length > 0 && (
        <div className="contributions-chart-section">
          <div className="chart-header">
            <h3>Contributions Over Time</h3>
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
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                interval={chartInterval}
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

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-value">{filteredPrs?.count || 0}</div>
          <div className="summary-label">Pull Requests</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{filteredCommits?.count || 0}</div>
          <div className="summary-label">Commits</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{filteredReviews?.count || 0}</div>
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
            {filteredPrs?.prs && filteredPrs.prs.length > 0 ? (
              <RepositoryGroupedList
                items={filteredPrs.prs}
                type="pr"
              />
            ) : (
              <div className="empty-state">No pull requests found for the selected time period</div>
            )}
          </div>
        )}

        {activeTab === 'commits' && (
          <div className="commits-list">
            {filteredCommits?.commits && filteredCommits.commits.length > 0 ? (
              <RepositoryGroupedList
                items={filteredCommits.commits}
                type="commit"
              />
            ) : (
              <div className="empty-state">No commits found for the selected time period</div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="reviews-list">
            {filteredReviews?.reviews && filteredReviews.reviews.length > 0 ? (
              <RepositoryGroupedList
                items={filteredReviews.reviews}
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
