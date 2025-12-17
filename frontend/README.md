# GitHub Team Tracker - Frontend

React frontend application for visualizing GitHub team contributions and productivity with GitHub OAuth authentication.

## Quick Start

```bash
npm install
npm run dev
```

The development server runs on `http://localhost:3000` with hot reload.

**First Time Setup:**
1. Ensure backend is running on `http://localhost:3001`
2. Navigate to `http://localhost:3000/login`
3. Click "Sign in with GitHub" to authenticate
4. After OAuth authorization, you'll be redirected to the dashboard

## Project Structure

```
/frontend
├── src/
│   ├── api.js                      - API client with caching and auth
│   ├── App.jsx                     - Root component with routing and auth provider
│   ├── index.css                   - Global styles
│   ├── pages/                      - Page components
│   │   ├── LoginPage.jsx           - GitHub OAuth login page
│   │   ├── Teams.jsx               - Team list dashboard (protected)
│   │   ├── Users.jsx               - User list page (protected)
│   │   ├── TeamDetail.jsx          - Team detail with charts (protected)
│   │   ├── TeamDetail.css          - Team detail styles
│   │   ├── UserDetail.jsx          - User detail with charts (protected)
│   │   └── UserDetail.css          - User detail styles
│   ├── components/                 - Reusable components
│   │   ├── ProtectedRoute.jsx      - Route authentication guard
│   │   ├── LoadingSpinner.jsx      - Loading indicator
│   │   └── Button.jsx              - Button component
│   ├── hooks/                      - Custom React hooks
│   │   ├── useAuth.jsx             - Authentication context provider
│   │   └── useScrollRestoration.js - Scroll position restoration
│   └── utils/                      - Utility functions
│       └── dateChunking.js         - Date range chunking utilities
├── .env.development                - Development environment config
├── vite.config.js                  - Vite configuration
└── package.json                    - Dependencies and scripts
```

## Authentication Architecture

### Overview

The frontend implements GitHub OAuth authentication with protected routes and global auth state management.

### Key Components

**1. Authentication Context (`src/hooks/useAuth.jsx`)**
```javascript
import { AuthProvider, useAuth } from './hooks/useAuth'

// Provides global auth state:
const { user, loading, checkAuth, logout } = useAuth()
```

- **user**: Current authenticated user object (or null)
- **loading**: Boolean indicating if auth check is in progress
- **checkAuth**: Function to re-check authentication status
- **logout**: Function to logout and clear session

**2. Protected Routes (`src/components/ProtectedRoute.jsx`)**
```javascript
<ProtectedRoute>
  <Teams />
</ProtectedRoute>
```

- Renders loading spinner during auth check
- Redirects to `/login` if user not authenticated
- Renders children if authenticated

**3. Login Page (`src/pages/LoginPage.jsx`)**
- Clean OAuth login UI with GitHub branding
- "Sign in with GitHub" button initiates OAuth flow
- Redirects to backend `/auth/github` endpoint

**4. API Client Authentication (`src/api.js`)**
```javascript
// All requests include credentials for session cookies
credentials: 'include'

// Auth-specific methods:
api.getCurrentUser()     // Fetch authenticated user
api.checkAuthStatus()    // Check if authenticated
api.logout()             // Logout and destroy session
api.initiateLogin()      // Redirect to OAuth flow
```

- **getBackendBaseUrl()**: Smart URL handling for auth routes (`/auth`) vs API routes (`/api`)
- **credentials: 'include'**: Sends session cookies with every request

### Authentication Flow

1. **Initial Load**: App wrapped in `<AuthProvider>` checks auth status on mount
2. **Unauthenticated**: User redirected to `/login` by `<ProtectedRoute>`
3. **Login Click**: `api.initiateLogin()` redirects to backend `/auth/github`
4. **OAuth Authorization**: User authorizes app on GitHub
5. **Callback**: Backend creates session, redirects to frontend root
6. **Session Check**: `AuthProvider` calls `/auth/user` to get user data
7. **Success**: User stored in React Context, protected routes accessible
8. **Persistence**: Session cookie maintained across page refreshes

### Route Protection

```javascript
// App.jsx
<AuthProvider>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
    <Route path="/team/:teamSlug" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
    <Route path="/user/:username" element={<ProtectedRoute><UserDetail /></ProtectedRoute>} />
  </Routes>
</AuthProvider>
```

All routes except `/login` require authentication.

### State Management

**Authentication State (`useAuth` hook)**:
```javascript
const [user, setUser] = useState(null)         // Current user object
const [loading, setLoading] = useState(true)    // Auth check in progress
```

**API Client**:
- Session cookies automatically sent with requests
- No manual token management needed in frontend
- Backend decrypts user's token for GitHub API calls

## Key Features

### Authentication
- **GitHub OAuth Login**: Secure authentication flow with GitHub
- **Protected Routes**: All pages except login require authentication
- **Session Persistence**: Login state maintained across refreshes
- **Automatic Redirects**: Unauthenticated users redirected to login

### Data Visualization
- **Time-Series Charts**: Interactive bar charts showing contributions over time
  - UserDetail: Single user's contributions by date chunk
  - TeamDetail: Two charts - aggregate team contributions over time + per-member breakdown
- **Chart Controls**: Toggle between stacked/grouped views and show/hide individual series (PRs, commits, reviews)
- **Color Coding**: Consistent colors across all charts (PRs: blue, Commits: green, Reviews: purple)

### Data Management
- **30-Day localStorage Cache**: Reduces redundant API calls with 30-day TTL
- **Date Chunking**: Breaks large date ranges into 30-day aligned chunks for efficient caching
- **Progressive Loading**: Real-time UI updates as data streams in
- **Deduplication**: Prevents counting the same item multiple times (by ID for PRs/reviews, SHA for commits)

### Query Optimization
- **All-Time Queries**: Sequential processing from newest to oldest with early termination after 3 consecutive empty chunks
- **Bounded Queries**: Parallel fetching for 30/90/365 day ranges
- **Chunk Stats Tracking**: Aggregates contributions at chunk level for time-series visualization

### User Experience
- **Progress Indicators**: Top bar shows loading progress with request counts and percentage
- **Refresh Button**: Manual cache bypass for latest data
- **Collapsible Sections**: Repository and user groupings with expand/collapse
- **Scroll Restoration**: Maintains scroll position when navigating back
- **Repository Grouping**: PRs/commits/reviews organized by repository
- **User Grouping**: Team PRs grouped by author within each status (Open/Merged/Closed)

## Pages

### Teams (`/`)
- Lists all teams in the organization
- Shows member count and description
- Clickable cards navigate to TeamDetail

### TeamDetail (`/team/:teamSlug`)
- **Two Time-Series Charts**:
  1. Team Contributions Over Time: Aggregate stats across all members by date chunk
  2. Contributions by Team Member: Per-member stats (sorted by total descending)
- **Member Cards**: Grid of team members with individual stats (PRs, commits, reviews, total)
- **Team PRs Section**: All team PRs grouped by status (Open/Merged/Closed), then by user
- **Time Range Selector**: 30/90/365 days or all-time
- **Chart Controls**: Stacking toggle and series visibility checkboxes

### UserDetail (`/user/:username`)
- **Time-Series Chart**: Contributions over time by date chunk
- **Summary Cards**: Total PRs, commits, reviews
- **Tabbed Interface**: Switch between PRs/Commits/Reviews
- **Repository Grouping**: Items grouped by repository with collapsible sections
- **Time Range Selector**: 30/90/365 days or all-time
- **Chart Controls**: Stacking toggle and series visibility checkboxes

## Technical Implementation

### Date Chunking (`src/utils/dateChunking.js`)
- **Reference Date**: January 1, 2024 as alignment anchor
- **Chunk Size**: Fixed 30-day boundaries
- **Functions**:
  - `getChunkStart(date)`: Returns start of chunk containing given date
  - `getChunkEnd(date)`: Returns end of chunk containing given date
  - `chunkDateRange(from, to)`: Splits date range into aligned 30-day chunks
  - `getDateRangeForPeriod(period)`: Converts period string to date range
  - `formatDateISO(date)`: Formats date as YYYY-MM-DD for cache keys

### API Client (`src/api.js`)
- **Cache Key Format**: `api_cache_{endpoint}_{queryParams}`
- **TTL**: 30 days (2,592,000,000 ms)
- **Cache Bypass**: Optional `bypassCache` parameter for refresh operations
- **Methods**:
  - `get(endpoint, options)`: Fetches data with caching
  - `getCacheKey(endpoint)`: Generates cache key
  - `getFromCache(key)`: Retrieves cached data if valid
  - `saveToCache(key, data)`: Stores data with timestamp
- **Automatic Cleanup**: Checks TTL on read, lazy cleanup approach

### State Management Patterns

**UserDetail State**:
```javascript
const [prs, setPrs] = useState({ prs: [], count: 0 })
const [commits, setCommits] = useState({ commits: [], count: 0 })
const [reviews, setReviews] = useState({ reviews: [], count: 0 })
const [chunkStats, setChunkStats] = useState({}) // For time-series chart
const [fetchProgress, setFetchProgress] = useState({ loaded: 0, total: 0 })
const [isStacked, setIsStacked] = useState(true)
const [visibleSeries, setVisibleSeries] = useState({ prs: true, commits: true, reviews: true })
```

**TeamDetail State**:
```javascript
const [memberStats, setMemberStats] = useState({}) // { username: { prs, commits, reviews, total } }
const [teamPRs, setTeamPRs] = useState([]) // All PRs with author field
const [chunkStats, setChunkStats] = useState({}) // For time-series chart
const [collapsedUsers, setCollapsedUsers] = useState({}) // Track collapsed user sections
```

### Data Fetching Strategies

**All-Time Queries** (UserDetail + TeamDetail):
```javascript
if (period === 'all-time') {
  const reversedChunks = [...chunks].reverse() // Newest first
  let consecutiveEmptyChunks = 0

  for (const chunk of reversedChunks) {
    if (consecutiveEmptyChunks >= 3) break // Early termination

    // Fetch data for chunk
    const total = prsCount + commitsCount + reviewsCount

    if (total === 0) {
      consecutiveEmptyChunks++
    } else {
      consecutiveEmptyChunks = 0 // Reset on finding data
    }
  }
}
```

**Bounded Queries** (30/90/365 days):
```javascript
await Promise.all(
  chunks.map(async (chunk) => {
    // Fetch all endpoints for this chunk in parallel
    const [prsData, commitsData, reviewsData] = await Promise.all([
      api.get(...),
      api.get(...),
      api.get(...)
    ])

    // Update state progressively
    setPrs(prev => ({ prs: [...prev.prs, ...newPrs], count: ... }))
  })
)
```

### Progressive UI Updates

All data fetching updates the UI **as data arrives**, not after all requests complete:

```javascript
setChunkStats(prev => ({
  ...prev,
  [chunkKey]: {
    prs: (prev[chunkKey]?.prs || 0) + prsCount,
    commits: (prev[chunkKey]?.commits || 0) + commitsCount,
    reviews: (prev[chunkKey]?.reviews || 0) + reviewsCount
  }
}))
```

### Chart Data Transformation

**Time-Series Chart** (by date chunk):
```javascript
const chartData = useMemo(() => {
  return Object.entries(chunkStats)
    .map(([dateKey, stats]) => ({
      name: dateKey, // YYYY-MM-DD
      PRs: stats.prs || 0,
      Commits: stats.commits || 0,
      Reviews: stats.reviews || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name)) // Chronological
}, [chunkStats])
```

**Per-Member Chart** (by username):
```javascript
const chartData = useMemo(() => {
  return members
    .map(member => ({
      name: username,
      PRs: stats.prs,
      Commits: stats.commits,
      Reviews: stats.reviews,
      Total: stats.total
    }))
    .sort((a, b) => b.Total - a.Total) // Highest first
}, [team, memberStats])
```

## Recent Changes

### Latest Commits
1. **Add time-series chart and user-grouped PRs to TeamDetail** (c79b4f8)
   - Added aggregate team contributions chart over time
   - Track chunk-level stats across all team members
   - Added per-member chart for comparison
   - Group team PRs by user within each status
   - Reorder PR cards to show repository first

2. **Add time-series contributions chart to UserDetail** (0d414c8)
   - Added time-series visualization for individual users
   - Implemented all-time query optimization with early termination
   - Added chart controls (stacking, series visibility)
   - Fixed progress bar display during refresh

3. **Increase API cache TTL to 30 days** (a24aaca)
   - Extended cache from 60 minutes to 30 days
   - Reduces API calls for historical data
   - Manual refresh still bypasses cache

## Configuration

### Environment Variables (`.env.development`)

```env
# API URL for development (direct to backend)
VITE_API_URL=http://localhost:3001/api
```

The API client uses this to construct requests:
- **API routes**: `${VITE_API_URL}` → `http://localhost:3001/api`
- **Auth routes**: Backend base URL → `http://localhost:3001/auth`

The `getBackendBaseUrl()` method strips the `/api` suffix for auth routes.

### Vite Config (`vite.config.js`)
- **Dev Server Port**: 3000
- **Hot Reload**: Enabled for JSX/CSS changes
- **Build Output**: `/dist` directory (gitignored)

## Styling Conventions

- **Component-Specific CSS**: Each page has its own CSS file (e.g., `TeamDetail.css`)
- **BEM-Like Classes**: `.component-element-modifier` pattern
- **Color Palette**:
  - Primary: `#0969da` (GitHub blue)
  - Success/Commits: `#2da44e` (green)
  - Reviews: `#bf3989` (purple)
  - Background: `#f6f8fa` (light gray)
  - Border: `#d0d7de` (medium gray)

## Dependencies

### Production
- `react` ^18.3.1 - UI framework
- `react-dom` ^18.3.1 - React DOM rendering
- `react-router-dom` ^7.10.1 - Client-side routing
- `recharts` ^3.6.0 - Chart library

### Development
- `vite` ^6.4.1 - Build tool and dev server
- `@vitejs/plugin-react` ^4.3.4 - React plugin for Vite

## Build & Deploy

```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

Build output goes to `/dist` directory (gitignored).

## Performance Notes

- **Chunk Size**: 30 days balances API efficiency vs cache granularity
- **Early Termination**: Saves hundreds of API calls for inactive users
- **Parallel Fetching**: Maximizes throughput for bounded ranges
- **Progressive Updates**: Keeps UI responsive during long fetches
- **Memoization**: `useMemo` prevents unnecessary re-renders of chart data
- **Deduplication**: Set-based checking prevents duplicate items

## Future Enhancements

Potential improvements:
- Persist user preferences (chart view, collapsed sections)
- Add CSV export for chart data
- Implement virtualization for very long lists
- Add real-time WebSocket updates
- Implement service worker for offline caching
- Add keyboard shortcuts for navigation
