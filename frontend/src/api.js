import { indexedDBCache } from './indexeddb-cache.js'

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
      this.clearCache() // async but fire-and-forget is fine for startup
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
  async getFromCache(endpoint) {
    if (!this.cacheEnabled) return null

    try {
      const cacheKey = this.getCacheKey(endpoint)
      const data = await indexedDBCache.get(cacheKey)

      if (data === null) {
        console.log(`❌ Cache MISS for ${endpoint} (not found or expired)`)
        return null
      }

      console.log(`✅ Cache HIT for ${endpoint}`)
      return data
    } catch (error) {
      console.warn(`❌ Cache MISS for ${endpoint} (error: ${error.message})`)
      return null
    }
  }

  /**
   * Store data in cache
   */
  async setCache(endpoint, data, ttl = DEFAULT_CACHE_TTL) {
    if (!this.cacheEnabled) return

    try {
      const cacheKey = this.getCacheKey(endpoint)
      const success = await indexedDBCache.set(cacheKey, data, ttl)

      if (success) {
        console.log(`💾 Cached ${endpoint} (TTL: ${Math.round(ttl / 1000)}s)`)
      } else {
        console.warn(`❌ Failed to cache ${endpoint}`)
      }
    } catch (error) {
      console.warn('Cache write error:', error)
    }
  }

  /**
   * Clear all cached API responses
   */
  async clearCache() {
    try {
      await indexedDBCache.clear()
    } catch (error) {
      console.warn('Cache clear error:', error)
    }
  }

  /**
   * Clear old cache entries (oldest first) to free up space
   */
  async clearOldCache() {
    try {
      await indexedDBCache.clearOld()
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

  async get(endpoint, options = {}) {
    const { bypassCache = false, cacheTTL = DEFAULT_CACHE_TTL } = options

    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cached = await this.getFromCache(endpoint)
      if (cached !== null) {
        return cached
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
      .then(async data => {
        await this.setCache(endpoint, data, cacheTTL)
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
