/**
 * IndexedDB-based cache for API responses
 * Provides much larger storage capacity than localStorage (50MB+ vs 5-10MB)
 */

const DB_NAME = 'github-tracker-cache'
const DB_VERSION = 1
const STORE_NAME = 'api-cache'

class IndexedDBCache {
  constructor() {
    this.db = null
    this.initPromise = this.init()
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('✅ IndexedDB initialized')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          // Create index on timestamp for efficient cleanup of old entries
          store.createIndex('timestamp', 'timestamp', { unique: false })
          console.log('📦 Created IndexedDB object store')
        }
      }
    })
  }

  /**
   * Ensure DB is ready before operations
   */
  async ensureReady() {
    if (!this.db) {
      await this.initPromise
    }
  }

  /**
   * Get cached data if available and not expired
   */
  async get(key) {
    try {
      await this.ensureReady()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(key)

        request.onsuccess = () => {
          const record = request.result

          if (!record) {
            resolve(null)
            return
          }

          const { data, timestamp, ttl } = record
          const age = Date.now() - timestamp

          // Check if cache is expired
          if (ttl !== undefined && ttl !== null && age > ttl) {
            // Delete expired entry
            this.delete(key)
            resolve(null)
            return
          }

          // Special case: if TTL is 0, cache should always be considered expired
          if (ttl === 0) {
            this.delete(key)
            resolve(null)
            return
          }

          resolve(data)
        }

        request.onerror = () => {
          console.warn('IndexedDB read error:', request.error)
          resolve(null)
        }
      })
    } catch (error) {
      console.warn('IndexedDB get error:', error)
      return null
    }
  }

  /**
   * Store data in cache
   */
  async set(key, data, ttl) {
    try {
      await this.ensureReady()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        const record = {
          key,
          data,
          timestamp: Date.now(),
          ttl,
        }

        const request = store.put(record)

        request.onsuccess = () => resolve(true)
        request.onerror = () => {
          console.warn('IndexedDB write error:', request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.warn('IndexedDB set error:', error)
      return false
    }
  }

  /**
   * Delete a specific cache entry
   */
  async delete(key) {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(key)

        request.onsuccess = () => resolve(true)
        request.onerror = () => {
          console.warn('IndexedDB delete error:', request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.warn('IndexedDB delete error:', error)
      return false
    }
  }

  /**
   * Clear all cached entries
   */
  async clear() {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.clear()

        request.onsuccess = () => {
          console.log('🗑️  Cleared all IndexedDB cache entries')
          resolve(true)
        }

        request.onerror = () => {
          console.warn('IndexedDB clear error:', request.error)
          resolve(false)
        }
      })
    } catch (error) {
      console.warn('IndexedDB clear error:', error)
      return false
    }
  }

  /**
   * Get count of cached entries
   */
  async count() {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.count()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          console.warn('IndexedDB count error:', request.error)
          resolve(0)
        }
      })
    } catch (error) {
      console.warn('IndexedDB count error:', error)
      return 0
    }
  }

  /**
   * Clear oldest cache entries (oldest 25%)
   */
  async clearOld() {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const index = store.index('timestamp')

        // Get all entries sorted by timestamp
        const entries = []
        const cursorRequest = index.openCursor()

        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result
          if (cursor) {
            entries.push({ key: cursor.value.key, timestamp: cursor.value.timestamp })
            cursor.continue()
          } else {
            // All entries collected, now delete oldest 25%
            const toRemove = Math.ceil(entries.length * 0.25)
            const deletePromises = []

            for (let i = 0; i < toRemove; i++) {
              store.delete(entries[i].key)
            }

            console.log(`🗑️  Cleared ${toRemove} old IndexedDB cache entries`)
            resolve(toRemove)
          }
        }

        cursorRequest.onerror = () => {
          console.warn('IndexedDB clearOld error:', cursorRequest.error)
          resolve(0)
        }
      })
    } catch (error) {
      console.warn('IndexedDB clearOld error:', error)
      return 0
    }
  }

  /**
   * Get all cache keys (for debugging/export)
   */
  async getAllKeys() {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.getAllKeys()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          console.warn('IndexedDB getAllKeys error:', request.error)
          resolve([])
        }
      })
    } catch (error) {
      console.warn('IndexedDB getAllKeys error:', error)
      return []
    }
  }

  /**
   * Get all cache entries (for debugging/export)
   */
  async getAll() {
    try {
      await this.ensureReady()

      return new Promise((resolve) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          console.warn('IndexedDB getAll error:', request.error)
          resolve([])
        }
      })
    } catch (error) {
      console.warn('IndexedDB getAll error:', error)
      return []
    }
  }
}

export const indexedDBCache = new IndexedDBCache()
