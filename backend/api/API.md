# GitHub Team Tracker API Documentation

Base URL: `http://localhost:3001`

## Health Check

### GET /health

Check if the API server is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-17T04:13:13.461Z",
  "organization": "foursquare"
}
```

## Teams Endpoints

### GET /api/teams

Get all teams in the organization.

**Response:**
```json
{
  "organization": "foursquare",
  "count": 104,
  "teams": [
    {
      "id": 3019769,
      "slug": "places-engineering",
      "name": "Places Engineering",
      "description": "Team description",
      "privacy": "closed",
      "membersCount": 15
    }
  ]
}
```

### GET /api/teams/:teamSlug/members

Get members of a specific team.

**Parameters:**
- `teamSlug` (string) - The team slug (e.g., "places-engineering")

**Response:**
```json
{
  "organization": "foursquare",
  "team": "places-engineering",
  "count": 15,
  "members": [
    {
      "id": 4956356,
      "login": "SteveVitali",
      "avatarUrl": "https://avatars.githubusercontent.com/u/4956356?v=4",
      "type": "User",
      "siteAdmin": false
    }
  ]
}
```

### GET /api/teams/:teamSlug/prs

Get all open PRs for members of a specific team.

**Parameters:**
- `teamSlug` (string) - The team slug (e.g., "places-engineering")

**Response:**
```json
{
  "organization": "foursquare",
  "team": "places-engineering",
  "memberCount": 15,
  "usersWithPRs": 7,
  "totalPRs": 120,
  "users": [
    {
      "username": "SteveVitali",
      "avatarUrl": "https://avatars.githubusercontent.com/u/4956356?v=4",
      "prs": [
        {
          "id": 3737171186,
          "number": 5463,
          "title": "Fix AWS rate limiting in portal-samples-delivery DAG",
          "url": "https://github.com/foursquare/orchestration/pull/5463",
          "repository": "orchestration",
          "createdAt": "2025-12-17T03:22:20Z",
          "updatedAt": "2025-12-17T03:34:38Z",
          "state": "open",
          "draft": false
        }
      ],
      "totalPRs": 54
    }
  ]
}
```

### GET /api/teams/membership-report

Get a report of all users and their team memberships across the organization.

**Note:** This endpoint may take some time to complete as it fetches all teams and their members.

**Response:**
```json
{
  "organization": "foursquare",
  "totalTeams": 104,
  "totalUsers": 124,
  "users": [
    {
      "id": 4956356,
      "login": "SteveVitali",
      "avatarUrl": "https://avatars.githubusercontent.com/u/4956356?v=4",
      "teams": [
        {
          "slug": "places-engineering",
          "name": "Places Engineering"
        },
        {
          "slug": "eng",
          "name": "Engineering"
        }
      ]
    }
  ]
}
```

## Pull Requests Endpoints

### POST /api/prs/by-teams

Get open PRs for members of multiple teams.

**Request Body:**
```json
{
  "teamSlugs": ["places-engineering", "data-team"]
}
```

**Response:**
```json
{
  "organization": "foursquare",
  "teams": ["places-engineering", "data-team"],
  "memberCount": 25,
  "usersWithPRs": 12,
  "totalPRs": 176,
  "users": [
    {
      "username": "SteveVitali",
      "avatarUrl": "https://avatars.githubusercontent.com/u/4956356?v=4",
      "totalPRs": 54,
      "repositories": [
        {
          "name": "orchestration",
          "prs": [
            {
              "id": 3737171186,
              "number": 5463,
              "title": "Fix AWS rate limiting in portal-samples-delivery DAG",
              "url": "https://github.com/foursquare/orchestration/pull/5463",
              "createdAt": "2025-12-17T03:22:20Z",
              "updatedAt": "2025-12-17T03:34:38Z",
              "state": "open",
              "draft": false
            }
          ]
        }
      ]
    }
  ]
}
```

### GET /api/prs/user/:username

Get open PRs for a specific user.

**Parameters:**
- `username` (string) - GitHub username (e.g., "SteveVitali")

**Response:**
```json
{
  "organization": "foursquare",
  "username": "SteveVitali",
  "totalPRs": 54,
  "repositories": [
    {
      "name": "orchestration",
      "count": 4,
      "prs": [
        {
          "id": 3737171186,
          "number": 5463,
          "title": "Fix AWS rate limiting in portal-samples-delivery DAG",
          "url": "https://github.com/foursquare/orchestration/pull/5463",
          "repository": "orchestration",
          "createdAt": "2025-12-17T03:22:20Z",
          "updatedAt": "2025-12-17T03:34:38Z",
          "state": "open",
          "draft": false
        }
      ]
    }
  ]
}
```

## Contributions Endpoints

**Note:** These endpoints use GitHub's GraphQL API to fetch contribution data. Due to GitHub's privacy restrictions, detailed contribution information is only available for:
- Public repositories
- Repositories where the authenticated user has access
- When querying your own contributions

For private organization repositories, the API returns a `restrictedContributions` count but may not show detailed contribution data.

### GET /api/contributions/user/:username

Get user contributions with flexible filtering options.

**Parameters:**
- `username` (string) - GitHub username

**Query Parameters:**
- `from` (string, optional) - ISO 8601 date string for start of range
- `to` (string, optional) - ISO 8601 date string for end of range
- `days` (number, optional) - Number of days to look back (default: 30)
- `org` (string, optional) - Organization to filter by (defaults to configured org)
- `period` (string, optional) - Quick period selection: `last-month`, `this-month`, `last-n-days`

**Examples:**
```bash
# Last 30 days (default)
GET /api/contributions/user/SteveVitali

# Last 7 days
GET /api/contributions/user/SteveVitali?days=7

# Specific date range
GET /api/contributions/user/SteveVitali?from=2025-11-01T00:00:00Z&to=2025-12-01T00:00:00Z

# Last month
GET /api/contributions/user/SteveVitali?period=last-month
```

**Response:**
```json
{
  "organization": "foursquare",
  "user": {
    "login": "SteveVitali",
    "name": "Steven Vitali",
    "avatarUrl": "https://avatars.githubusercontent.com/u/4956356?v=4"
  },
  "period": {
    "from": "2025-11-17T04:25:39Z",
    "to": "2025-12-17T04:25:39Z"
  },
  "summary": {
    "totalCommits": 150,
    "totalPullRequests": 12,
    "totalReviews": 25,
    "totalIssues": 5,
    "restrictedContributions": 78,
    "hasActivity": true
  },
  "commits": {
    "byRepository": [
      {
        "repository": {
          "name": "fsq-graph",
          "fullName": "foursquare/fsq-graph",
          "url": "https://github.com/foursquare/fsq-graph",
          "owner": "foursquare"
        },
        "totalCount": 45,
        "contributions": [
          {
            "date": "2025-12-16T10:30:00Z",
            "commitCount": 3
          }
        ]
      }
    ]
  },
  "pullRequests": [
    {
      "occurredAt": "2025-12-16T15:20:00Z",
      "pullRequest": {
        "id": "PR_kwDOABcD123",
        "number": 5463,
        "title": "Fix AWS rate limiting",
        "url": "https://github.com/foursquare/orchestration/pull/5463",
        "state": "OPEN",
        "isDraft": false,
        "createdAt": "2025-12-16T15:20:00Z",
        "mergedAt": null,
        "closedAt": null,
        "repository": {
          "name": "orchestration",
          "fullName": "foursquare/orchestration",
          "url": "https://github.com/foursquare/orchestration",
          "owner": "foursquare"
        }
      }
    }
  ],
  "reviews": [
    {
      "occurredAt": "2025-12-15T14:30:00Z",
      "pullRequest": {
        "id": "PR_kwDOABcD456",
        "number": 1234,
        "title": "Add new feature",
        "url": "https://github.com/foursquare/fsq-graph/pull/1234",
        "state": "MERGED",
        "repository": {
          "name": "fsq-graph",
          "fullName": "foursquare/fsq-graph",
          "url": "https://github.com/foursquare/fsq-graph",
          "owner": "foursquare"
        }
      },
      "review": {
        "id": "PRR_kwDOABcD789",
        "state": "APPROVED",
        "createdAt": "2025-12-15T14:30:00Z",
        "submittedAt": "2025-12-15T14:32:00Z"
      }
    }
  ],
  "issues": []
}
```

### GET /api/contributions/user/:username/last-month

Get user contributions for the last calendar month.

**Parameters:**
- `username` (string) - GitHub username

**Query Parameters:**
- `org` (string, optional) - Organization to filter by

**Response:** Same structure as main contributions endpoint.

### GET /api/contributions/user/:username/this-month

Get user contributions for the current calendar month.

**Parameters:**
- `username` (string) - GitHub username

**Query Parameters:**
- `org` (string, optional) - Organization to filter by

**Response:** Same structure as main contributions endpoint.

### POST /api/contributions/users

Get contributions for multiple users at once.

**Request Body:**
```json
{
  "usernames": ["SteveVitali", "alilewin"],
  "period": "last-month",
  "days": 30,
  "org": "foursquare"
}
```

**Parameters:**
- `usernames` (string[], required) - Array of GitHub usernames
- `period` (string, optional) - `last-month`, `this-month`, or `last-n-days`
- `days` (number, optional) - Number of days to look back (default: 30)
- `org` (string, optional) - Organization to filter by

**Response:**
```json
{
  "organization": "foursquare",
  "users": [
    {
      "user": { "login": "SteveVitali", ... },
      "summary": { ... },
      ...
    },
    {
      "user": { "login": "alilewin", ... },
      "summary": { ... },
      ...
    }
  ]
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message description",
  "path": "/api/teams/invalid-team"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

The API implements automatic retry logic with exponential backoff for GitHub API rate limits. If rate limits are exceeded, the server will:
1. Automatically retry with increasing delays (1s, 2s, 4s, etc.)
2. Skip users that exceed rate limits after retries
3. Log warnings for skipped users

## CORS

CORS is enabled for all origins to support frontend development.
