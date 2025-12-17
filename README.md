# GitHub Team Tracker

A full-stack application for tracking GitHub team productivity, contributions, and membership with rich data visualization.

## Project Structure

```
/
├── backend/          - REST API server (Node.js + Express)
│   ├── lib/         - GitHub API clients and utilities
│   └── api/         - Express routes and server
│
└── frontend/        - Frontend application (React + Vite)
    ├── src/
    │   ├── pages/   - Main application pages
    │   ├── components/ - Reusable UI components
    │   ├── utils/   - Date chunking and utilities
    │   └── api.js   - API client with localStorage caching
```

## Getting Started

### Backend

See [backend/README.md](backend/README.md) for detailed setup and API documentation.

**Quick start:**
```bash
cd backend
npm install --registry https://registry.npmjs.org/ --cache ~/.npm
cp .env.example .env
# Edit .env with your GitHub token and organization

# Start the API server
npm start
```

The API server runs on `http://localhost:3001` by default.

### Frontend

The frontend is a React application built with Vite.

**Quick start:**
```bash
cd frontend
npm install
npm run dev
```

The frontend development server runs on `http://localhost:3001` and proxies API requests to the backend.

## Features

### Backend
- **Team Management**: View teams and team members across your GitHub organization
- **Pull Request Tracking**: Monitor open PRs by team or individual user
- **Contribution Analytics**: Track commits, PR reviews, and authored PRs over custom date ranges
- **Team Reports**: Generate membership reports showing which users belong to which teams
- **API Call Tracking**: Every response includes metadata about GitHub API usage
- **Automatic Retry Logic**: Handles rate limits with exponential backoff (up to 16 retries)

### Frontend
- **Team Dashboard**: Browse all teams with member counts and descriptions
- **User Detail Pages**: View individual contributor stats with time-series visualizations
- **Team Detail Pages**: Aggregate team contributions with both time-series and per-member breakdowns
- **Time-Series Charts**: Interactive bar charts showing contributions over time (PRs, commits, reviews)
- **Chart Controls**: Toggle between stacked/grouped views and show/hide series
- **User-Grouped PR Lists**: PRs organized by author within each status section (Open/Merged/Closed)
- **Repository Grouping**: Contributions grouped by repository with collapsible sections
- **Progressive Loading**: Real-time progress indicators during data fetching
- **Smart Caching**: 30-day localStorage cache with manual refresh capability
- **Date Range Filtering**: Filter by 30/90/365 days or all-time with optimized chunking
- **All-Time Query Optimization**: Sequential processing with early termination for inactive periods
- **Scroll Restoration**: Maintains scroll position when navigating back

## API Highlights

The backend provides a REST API with 11 endpoints:

- `/health` - Health check
- `/api/users` - Organization members
- `/api/teams/*` - Team management (list, members, PRs, membership reports)
- `/api/prs/*` - Pull request tracking (by team or user)
- `/api/contributions/user/:username/*` - Historical contribution data (commits, reviews, PRs)

All contribution endpoints support flexible date filtering via query parameters (`from`, `to`, `days`).

## Requirements

- Node.js v18+ (v20+ recommended)
- GitHub Personal Access Token with:
  - `read:org` scope (for team membership)
  - `repo` scope (for pull requests and commits)

## Technology Stack

### Backend
- Node.js with ES modules
- Express.js for REST API
- Octokit (@octokit/rest and @octokit/graphql) for GitHub API
- AsyncLocalStorage for request-scoped API tracking

### Frontend
- React 18.3.1 with Hooks (useState, useEffect, useMemo)
- Vite 6.4.1 for build tooling and dev server
- React Router DOM 7.10.1 for routing
- Recharts 3.6.0 for data visualization
- CSS for styling (no CSS-in-JS framework)

### Key Design Decisions

**Backend:**
- GraphQL for efficient bulk PR fetching (open PRs)
- REST Search API for historical data (commits, reviews, past PRs)
- Automatic pagination up to GitHub's limits (1000 results for search)
- Error propagation for proper status codes vs silent failures

**Frontend:**
- 30-day date chunking with fixed boundaries for consistent cache keys
- localStorage caching with 30-day TTL to minimize API calls
- Progressive UI updates during data fetching (not batch updates)
- Deduplication by ID/SHA to prevent double-counting
- Sequential processing for all-time queries with early termination after 3 consecutive empty chunks
- Parallel processing for bounded time ranges (30/90/365 days)

## Data Flow

1. **Frontend** sends requests to backend API with date ranges
2. **Backend** queries GitHub API with pagination and retry logic
3. **Frontend** caches responses in localStorage with date-keyed buckets
4. **Charts** aggregate data across chunks for visualization
5. **Refresh button** bypasses cache for latest data

## Development

Both backend and frontend include development modes with hot reload:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Performance Optimizations

- **Date Chunking**: Breaks large date ranges into 30-day segments for efficient API usage
- **Chunk-Level Caching**: Each 30-day chunk is cached independently
- **Early Termination**: All-time queries stop after finding 3 consecutive empty chunks
- **Progressive Loading**: UI updates as data streams in, not after all requests complete
- **Deduplication**: Prevents counting the same PR/commit/review multiple times
- **Parallel Fetching**: Non-all-time queries fetch all chunks simultaneously
