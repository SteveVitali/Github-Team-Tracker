# Technical Notes

This document contains implementation details and architectural decisions for future reference.

## Recent Enhancements (December 2024)

### 1. Migration from localStorage to IndexedDB

**Motivation**: localStorage has a ~5-10MB limit and synchronous API that blocks the main thread.

**Implementation**:
- Created `frontend/src/indexeddb-cache.js` wrapper around IndexedDB
- Database: `github-tracker-cache` (version 1)
- Object store: `cache` with keyPath `key`
- Schema: `{ key, data, timestamp, ttl }`
- Automatic expiration checking on read
- Size-aware with quota tracking and smart eviction (oldest-first)

**Key Methods**:
- `get(key)`: Returns data or null if expired/missing
- `set(key, data, ttl)`: Stores with expiration
- `getAll()`: Returns all cache entries (for export)
- `clear()`: Wipes entire cache
- `clearOld()`: Removes oldest 30% when storage is low

### 2. Request Queue with Concurrency Limiting

**Problem**: When loading "all time" data, the frontend would fire 200+ parallel requests that would all queue up on the backend, causing issues during navigation.

**Solution**: Global request queue in `api.js` with max 10 concurrent requests.

**Implementation Details**:
- `maxConcurrentRequests = 10`
- `requestQueue` array of `{ executor, signal }` objects
- `activeRequests` counter
- `queuedRequests` counter
- `processQueue()` pulls from queue when slots available
- `enqueueRequest(executor, signal, priority)` adds to queue
  - `priority='high'`: Uses `unshift()` for LIFO (stack behavior)
  - `priority='normal'`: Uses `push()` for FIFO (queue behavior)

**Key Features**:
- Checks AbortSignal before executing queued requests
- Automatically processes next item when request completes
- Notifies stats listeners on every state change

### 3. AbortController for Request Cancellation

**Problem**: When user changes time period or navigates away, in-progress requests continue and update stale state.

**Solution**: AbortController pattern in React components with cleanup.

**Implementation Pattern**:
```javascript
useEffect(() => {
  const abortController = new AbortController()
  let isCancelled = false

  fetchData(abortController)

  return () => {
    isCancelled = true
    abortController.abort()
  }
}, [dependencies])
```

**Key Points**:
- AbortSignal passed through API layers to fetch()
- All state updates wrapped in `if (!isCancelled)` checks
- AbortError caught and handled gracefully (not logged as errors)
- Queued requests can be aborted before they even start

**Files Modified**:
- `frontend/src/pages/TeamDetail.jsx`
- `frontend/src/pages/UserDetail.jsx`
- `frontend/src/api.js`

### 4. Real-Time Request Counter

**Purpose**: Provide visibility into API activity for debugging and user feedback.

**Implementation**:
- Observer pattern with `onStatsChange(listener)` in ApiClient
- Returns unsubscribe function for cleanup
- Notifies on every queue/active count change
- `RequestCounter` component subscribes and displays stats

**Component**: `frontend/src/components/RequestCounter.jsx`
- Shows format: "🔄 N active, M queued"
- Animated spinner icon
- Auto-hides when no requests pending
- Positioned in header next to user info

### 5. Tab State Persistence

**Purpose**: Remember which tab user was viewing when they return to a page.

**Implementation**:
- localStorage with page-specific keys
- Initialize state from localStorage in useState
- useEffect to save on change

**Keys**:
- `homepage-tab`: Teams or Users
- `team-tab-${teamSlug}`: Contributions, Members, or PRs
- `user-tab-${username}`: PRs, Commits, or Reviews
- `team-period-${teamSlug}`: 30days, 90days, 365days, all-time
- `user-period-${username}`: 30days, 90days, 365days, all-time

### 6. Smart Period Button Disabling

**Behavior**: During data loading, only allows expanding to larger date ranges.

**Logic**:
```javascript
const periodSizes = { '30days': 1, '90days': 2, '365days': 3, 'all-time': 4 }
const isDisabled = loading && optionSize <= currentSize
```

**Reasoning**:
- Prevents wasteful API calls when switching to smaller ranges
- Allows expanding because larger ranges reuse already-fetched data
- Disables current selection during loading to prevent double-triggers

### 7. Export Cache Functionality

**Purpose**: Allow users to download cached data for backup or analysis.

**Implementation**:
- Three export buttons: global, per-team, per-user
- Filters IndexedDB entries by key patterns
- Formats as JSON with metadata (data, timestamp, ttl)
- Downloads as `github-tracker-cache-YYYY-MM-DD.json`

**Files**:
- Global: `frontend/src/pages/HomePage.jsx` (line 40-76)
- Team: `frontend/src/pages/TeamDetail.jsx` (line 584-626)
- User: `frontend/src/pages/UserDetail.jsx` (line 523-565)

## Architecture Patterns

### Date Chunking Strategy

**Reference Date**: January 1, 2024 00:00:00 UTC

**Chunk Size**: 30 days (aligned to fixed boundaries)

**Purpose**: Ensures consistent cache keys across different time range queries.

**Example**:
- If user queries Jan 15 - Feb 15, chunks align to:
  - Jan 1 - Jan 30
  - Jan 31 - Feb 29

**Key Functions** (`frontend/src/utils/dateChunking.js`):
- `getChunkStart(date)`: Returns start of chunk containing date
- `getChunkEnd(date)`: Returns end of chunk containing date
- `chunkDateRange(from, to)`: Splits range into 30-day chunks
- `getDateRangeForPeriod(period)`: Maps period names to date ranges

### All-Time Query Optimization

**Strategy**: Sequential processing from newest to oldest with early termination.

**Logic**:
1. Reverse chunks (newest first)
2. Process sequentially (not parallel)
3. Track consecutive empty chunks
4. Stop after 3 consecutive empty chunks

**Reasoning**: Most users are inactive in recent months. By processing newest first and stopping at inactivity, we avoid fetching years of empty data.

**Implementation**: `frontend/src/pages/UserDetail.jsx` (lines 85-256)

### In-Flight Request Deduplication

**Purpose**: Prevent redundant API calls when multiple components request the same data.

**Implementation**:
- `inFlightRequests` Map in ApiClient
- Key: endpoint string
- Value: Promise
- Checked before making GET request
- Cleaned up on completion

**Code**: `frontend/src/api.js` (lines 254-285)

## Common Patterns

### Progressive UI Updates

**Pattern**: Update UI as data arrives, not after all requests complete.

**Example**:
```javascript
setPrs(prev => {
  const existingIds = new Set(prev.prs.map(pr => pr.id))
  const newPrs = (prsData.prs || []).filter(pr => !existingIds.has(pr.id))
  return {
    prs: [...prev.prs, ...newPrs],
    count: prev.prs.length + newPrs.length
  }
})
```

**Key**: Deduplication by ID/SHA to prevent double-counting.

### Functional State Updates

**Pattern**: Always use function form of setState when updating based on previous state.

**Correct**:
```javascript
setCount(prev => prev + 1)
```

**Incorrect** (race condition):
```javascript
setCount(count + 1)
```

**Reasoning**: Ensures updates are based on latest state, not stale closure.

## Performance Considerations

### Memory Management

**IndexedDB Size Tracking**:
- Estimates storage usage
- Triggers cleanup at 80% quota
- Clears oldest 30% of entries

**React Component Cleanup**:
- AbortController cleanup in useEffect
- Unsubscribe from stats listeners
- Clear intervals/timeouts

### Network Optimization

**Concurrency Limiting**:
- Max 10 concurrent requests prevents server overload
- Queue depth visible to user via counter

**Request Cancellation**:
- Aborts unnecessary requests on navigation
- Prevents wasted bandwidth and server load

**Caching Strategy**:
- 30-day TTL balances freshness and API usage
- Chunk-level caching enables partial cache hits
- Manual refresh bypasses cache when needed

## Debugging Tips

### Enable Console Logging

The app logs extensively to console:
- `[Queue]`: Request queue operations
- `[TeamDetail]` / `[UserDetail]`: Component lifecycle
- `[dateChunking]`: Date range calculations
- Cache hits/misses with emoji indicators

### Check Request Counter

The nav bar counter shows real-time API activity:
- Active: Currently executing
- Queued: Waiting for slot

### Export Cache for Analysis

Use export buttons to download cache as JSON and inspect:
- What's cached
- When it expires
- Data completeness

### Inspect IndexedDB

Chrome DevTools → Application → Storage → IndexedDB → `github-tracker-cache`

## Future Improvements

### Potential Enhancements

1. **Service Worker Caching**: Cache API responses for offline support
2. **Pagination in UI**: Show first 100 results, load more on demand
3. **WebWorker for Data Processing**: Offload aggregation to background thread
4. **GraphQL Batching**: Batch multiple user queries into single GraphQL request
5. **Automatic Priority Setting**: Detect route changes and auto-set priority='high'
6. **Cache Preloading**: Preload likely-next pages in background
7. **Delta Updates**: Only fetch new contributions since last query
8. **Push Notifications**: Notify when new PRs/commits from team members

### Known Limitations

1. **GitHub Search API Limit**: Max 1000 results per query (may miss data for very active users)
2. **Browser Storage Quota**: IndexedDB typically ~50MB-100MB on mobile, several GB on desktop
3. **No Real-Time Updates**: Data only refreshes on manual action or page load
4. **Request Deduplication Key**: Uses endpoint string only, doesn't account for different auth contexts

## Migration Notes

### localStorage → IndexedDB Migration

**Breaking Change**: Users will lose cached data on first load after this update.

**Automatic Cleanup**: Old localStorage keys should be manually cleaned:
```javascript
// Run once in DevTools console to clean old cache
Object.keys(localStorage)
  .filter(key => key.startsWith('api_cache_'))
  .forEach(key => localStorage.removeItem(key))
```

**Future**: Consider automatic migration script in `App.jsx` initialization.
