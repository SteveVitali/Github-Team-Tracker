const API_URL = import.meta.env.VITE_API_URL || '/api'

// Cache configuration
const CACHE_PREFIX = 'api_cache_'
const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds

class ApiClient {
  constructor() {
    this.cacheEnabled = true
    this.inFlightRequests = new Map() // Track in-flight requests to prevent duplicates

    // Auto-clear cache if DEFAULT_CACHE_TTL is 0 (development mode)
    if (DEFAULT_CACHE_TTL === 0) {
      console.log('🗑️  Cache TTL is 0, clearing all cache on startup')
      this.clearCache()
    }
  }

  /**
   * Generate a cache key for a given endpoint
   * Includes query params to ensure different queries are cached separately
   */
  getCacheKey(endpoint) {
    // Normalize the endpoint to ensure consistent cache keys
    // Parse URL to separate path and query params
    const url = new URL(endpoint, 'http://placeholder.com')
    const path = url.pathname

    // Sort query params for consistent cache keys
    const params = Array.from(url.searchParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')

    const cacheKey = params ? `${path}?${params}` : path
    return `${CACHE_PREFIX}${cacheKey}`
  }

  /**
   * Get cached data if available and not expired
   */
  getFromCache(endpoint) {
    if (!this.cacheEnabled) return null

    try {
      const cacheKey = this.getCacheKey(endpoint)
      const cached = localStorage.getItem(cacheKey)

      if (!cached) {
        console.log(`❌ Cache MISS for ${endpoint} (not found)`)
        return null
      }

      const { data, timestamp, ttl } = JSON.parse(cached)
      const age = Date.now() - timestamp

      // Check if cache is expired (ttl of 0 means always expired)
      if (ttl !== undefined && ttl !== null && age > ttl) {
        console.log(`❌ Cache MISS for ${endpoint} (expired: ${Math.round(age / 1000)}s old, TTL: ${Math.round(ttl / 1000)}s)`)
        localStorage.removeItem(cacheKey)
        return null
      }

      // Special case: if TTL is 0, cache should always be considered expired
      if (ttl === 0) {
        console.log(`❌ Cache MISS for ${endpoint} (TTL is 0)`)
        localStorage.removeItem(cacheKey)
        return null
      }

      console.log(`✅ Cache HIT for ${endpoint} (age: ${Math.round(age / 1000)}s)`)
      return data
    } catch (error) {
      console.warn(`❌ Cache MISS for ${endpoint} (error: ${error.message})`)
      return null
    }
  }

  /**
   * Store data in cache
   */
  setCache(endpoint, data, ttl = DEFAULT_CACHE_TTL) {
    if (!this.cacheEnabled) return

    const cacheKey = this.getCacheKey(endpoint)
    const cacheData = {
      data,
      timestamp: Date.now(),
      ttl,
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
      console.log(`💾 Cached ${endpoint} (TTL: ${ttl / 1000}s)`)
    } catch (error) {
      // If localStorage is full, clear old cache entries and retry once
      if (error.name === 'QuotaExceededError') {
        console.warn(`⚠️  localStorage quota exceeded, clearing old cache entries...`)
        this.clearOldCache()

        // Retry the write after clearing
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData))
          console.log(`💾 Cached ${endpoint} after clearing old entries (TTL: ${ttl / 1000}s)`)
        } catch (retryError) {
          console.warn(`❌ Cache write failed even after clearing old entries:`, retryError)
        }
      } else {
        console.warn('Cache write error:', error)
      }
    }
  }

  /**
   * Clear all cached API responses
   */
  clearCache() {
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX))
      cacheKeys.forEach(key => localStorage.removeItem(key))
      console.log(`🗑️  Cleared ${cacheKeys.length} cache entries`)
    } catch (error) {
      console.warn('Cache clear error:', error)
    }
  }

  /**
   * Clear old cache entries (oldest first) to free up space
   */
  clearOldCache() {
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX))

      // Parse and sort by timestamp
      const entries = cacheKeys.map(key => {
        try {
          const { timestamp } = JSON.parse(localStorage.getItem(key))
          return { key, timestamp }
        } catch {
          return { key, timestamp: 0 }
        }
      }).sort((a, b) => a.timestamp - b.timestamp)

      // Remove oldest 25%
      const toRemove = Math.ceil(entries.length * 0.25)
      entries.slice(0, toRemove).forEach(({ key }) => {
        localStorage.removeItem(key)
      })

      console.log(`🗑️  Cleared ${toRemove} old cache entries`)
    } catch (error) {
      console.warn('Old cache clear error:', error)
    }
  }

  /**
   * Disable cache for this instance
   */
  disableCache() {
    this.cacheEnabled = false
    return this
  }

  /**
   * Enable cache for this instance
   */
  enableCache() {
    this.cacheEnabled = true
    return this
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`

    // Check for PAT in localStorage
    const pat = localStorage.getItem('github_pat')

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(pat ? { 'Authorization': `Bearer ${pat}` } : {}),
        ...options.headers,
      },
      credentials: 'include', // Include cookies for session management
      ...options,
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }))
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  get(endpoint, options = {}) {
    const { bypassCache = false, cacheTTL = DEFAULT_CACHE_TTL } = options

    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cached = this.getFromCache(endpoint)
      if (cached !== null) {
        return Promise.resolve(cached)
      }
    } else {
      console.log(`⚠️  Cache BYPASSED for ${endpoint}`)
    }

    // Check if this request is already in-flight to prevent duplicates
    const requestKey = endpoint // Use endpoint as key since GET requests are idempotent
    if (this.inFlightRequests.has(requestKey)) {
      console.log(`🔄 Request DEDUPED for ${endpoint} (already in-flight)`)
      return this.inFlightRequests.get(requestKey)
    }

    // Make the request and cache the result
    const requestPromise = this.request(endpoint, { ...options, method: 'GET' })
      .then(data => {
        this.setCache(endpoint, data, cacheTTL)
        return data
      })
      .finally(() => {
        // Clean up in-flight tracking when request completes (success or failure)
        this.inFlightRequests.delete(requestKey)
      })

    // Track this in-flight request
    this.inFlightRequests.set(requestKey, requestPromise)

    return requestPromise
  }

  post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' })
  }

  // Authentication methods (these use direct backend URLs, not API_URL prefix)
  // Auth routes are at /auth, not /api/auth, so we use the backend base URL
  getBackendBaseUrl() {
    // Extract base URL from VITE_API_URL or use default
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    // Remove /api suffix if present
    return apiUrl.replace(/\/api$/, '')
  }

  async checkAuthStatus() {
    const backendUrl = this.getBackendBaseUrl()
    const response = await fetch(`${backendUrl}/auth/status`, {
      credentials: 'include',
    })
    return response.json()
  }

  async getCurrentUser() {
    const backendUrl = this.getBackendBaseUrl()
    const response = await fetch(`${backendUrl}/auth/user`, {
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error('Not authenticated')
    }
    return response.json()
  }

  async logout() {
    // Clear PAT if using PAT auth
    const hasPAT = localStorage.getItem('github_pat')
    if (hasPAT) {
      localStorage.removeItem('github_pat')
      return { success: true }
    }

    // Otherwise use OAuth logout
    const backendUrl = this.getBackendBaseUrl()
    const response = await fetch(`${backendUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    return response.json()
  }

  // GitHub OAuth flow is handled by redirecting to backend
  initiateLogin() {
    const backendUrl = this.getBackendBaseUrl()
    window.location.href = `${backendUrl}/auth/github`
  }

  // PAT authentication methods
  loginWithPAT(token) {
    localStorage.setItem('github_pat', token)
  }

  hasPAT() {
    return !!localStorage.getItem('github_pat')
  }

  getPAT() {
    return localStorage.getItem('github_pat')
  }
}

export const api = new ApiClient()
