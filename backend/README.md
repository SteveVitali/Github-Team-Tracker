# GitHub Team Tracker - Backend

REST API server for tracking GitHub team productivity and contributions.

## Setup

1. **Create a GitHub Personal Access Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate a new token with these scopes:
     - `read:org` (to read team membership)
     - `repo` (to read pull requests and commit data)

2. **Configure the application**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your token:
   ```
   GITHUB_TOKEN=your_github_token_here
   GITHUB_ORG=foursquare
   ```

3. **Install dependencies**
   ```bash
   npm install --registry https://registry.npmjs.org/ --cache ~/.npm
   ```

## Project Structure

```
/backend
  /lib                      - Shared library code
    config.js               - Configuration management
    github-client.js        - GitHub REST API client
    github-contributions.js - GitHub GraphQL client for PRs
    api-tracker.js          - API call tracking
  /api                      - REST API server
    server.js               - Express server setup
    /routes
      teams.js              - Team-related endpoints
      prs.js                - PR-related endpoints
      users.js              - User-related endpoints
      contributions.js      - Contribution tracking endpoints
```

## Usage

### Start the API Server

```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and configuration.

### Users
```
GET /api/users
```
Get all members in the organization.

### Teams
```
GET /api/teams
```
Get all teams in the organization.

```
GET /api/teams/:teamSlug/members
```
Get members of a specific team.

```
GET /api/teams/:teamSlug/prs
```
Get open PRs for all members of a specific team.

```
GET /api/teams/membership-report
```
Get a report of all users and their team memberships.

### Pull Requests
```
POST /api/prs/by-teams
Body: { "teamSlugs": ["team1", "team2"] }
```
Get open PRs for members of multiple teams, grouped by repository.

```
GET /api/prs/user/:username
```
Get open PRs for a specific user, grouped by repository.

### Contributions
All contribution endpoints support flexible date filtering via query parameters.

```
GET /api/contributions/user/:username/commits
Query params:
  - from: Date string (optional, defaults to 30 days ago)
  - to: Date string (optional, defaults to now)
  - days: Number (optional, defaults to 30)
```
Get commits by a user within the specified date range.

```
GET /api/contributions/user/:username/reviews
Query params: same as commits endpoint
```
Get PR reviews by a user within the specified date range.

```
GET /api/contributions/user/:username/prs
Query params: same as commits endpoint
```
Get PRs created by a user within the specified date range.

**Note:** Dates are interpreted in UTC. The GitHub Search API has a hard limit of 1000 results per query.

## Features

- **Rate Limiting**: Automatic retry with exponential backoff (configurable up to 16 retries)
- **API Call Tracking**: Each response includes `_meta` field with GitHub API usage stats
- **Pagination**: Automatically fetches multiple pages up to GitHub's limits
- **Error Propagation**: Proper HTTP status codes for rate limits and errors
- **GraphQL Batching**: Efficient bulk operations for open PRs
- **REST Search API**: Used for historical data (commits, reviews, PRs) to bypass GraphQL privacy restrictions

## Requirements

- Node.js v18+ (v20+ recommended)
- GitHub Personal Access Token with `read:org` and `repo` scopes
- Access to the target GitHub organization

## Configuration

Environment variables (`.env`):

```
GITHUB_TOKEN=         # Required: GitHub PAT
GITHUB_ORG=           # Required: Organization name
PORT=3001             # Optional: Server port (default: 3001)
REQUEST_DELAY_MS=0    # Optional: Delay between requests (default: 0)
MAX_RETRIES=16        # Optional: Max retry attempts (default: 16)
INITIAL_BACKOFF_MS=1000  # Optional: Initial backoff time (default: 1000)
```

## Notes

- Team names should match GitHub team slugs (lowercase, hyphenated)
- PRs are fetched using GraphQL for efficiency
- Historical contribution data uses REST Search API for better privacy handling
- All responses include API call tracking in the `_meta` field
