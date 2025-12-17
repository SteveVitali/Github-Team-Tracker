# GitHub Team Tracker

A full-stack application for tracking GitHub team productivity, contributions, and membership.

## Project Structure

```
/
├── backend/          - REST API server (Node.js + Express)
│   ├── lib/         - GitHub API clients and utilities
│   └── api/         - Express routes and server
│
└── webapp/          - Frontend application (React)
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

Frontend application is under development in the `webapp` directory.

## Features

- **Team Management**: View teams and team members across your GitHub organization
- **Pull Request Tracking**: Monitor open PRs by team or individual user
- **Contribution Analytics**: Track commits, PR reviews, and authored PRs over custom date ranges
- **Team Reports**: Generate membership reports showing which users belong to which teams
- **API Call Tracking**: Every response includes metadata about GitHub API usage
- **Automatic Retry Logic**: Handles rate limits with exponential backoff (up to 16 retries)

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

**Backend:**
- Node.js with ES modules
- Express.js for REST API
- Octokit (@octokit/rest and @octokit/graphql) for GitHub API
- AsyncLocalStorage for request-scoped API tracking

**Key Design Decisions:**
- GraphQL for efficient bulk PR fetching (open PRs)
- REST Search API for historical data (commits, reviews, past PRs)
- Automatic pagination up to GitHub's limits (1000 results for search)
- Error propagation for proper status codes vs silent failures
