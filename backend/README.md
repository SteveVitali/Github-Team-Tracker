# GitHub Team Tracker - Backend

REST API server for tracking GitHub team productivity and contributions with GitHub OAuth authentication.

## Setup

### 1. Create a GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Fill in the application details:
   - **Application name**: GitHub Team Tracker (or your preferred name)
   - **Homepage URL**: `http://localhost:3000` (for development)
   - **Authorization callback URL**: `http://localhost:3001/auth/github/callback`
3. Click "Register application"
4. Note down the **Client ID** and generate a **Client Secret**

### 2. Create a System/Fallback GitHub Personal Access Token

This token is used as a fallback in development mode when user OAuth tokens are unavailable.

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with these scopes:
   - `read:org` (to read team membership)
   - `repo` (to read pull requests and commit data)
   - `read:user` (to read user profile information)

### 3. Configure the Application

```bash
cp .env.example .env
```

Edit `.env` and configure all required values:

```env
# GitHub Personal Access Token (system/fallback token)
GITHUB_TOKEN=your_github_token_here

# GitHub Organization name
GITHUB_ORG=your_org_name

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback

# Security - Session Management
SESSION_SECRET=generate_a_long_random_string_here

# Security - Token Encryption (must be 64 hex characters = 32 bytes)
ENCRYPTION_KEY=generate_64_hex_character_string_here

# Frontend URL (for CORS and OAuth redirects)
FRONTEND_URL=http://localhost:3000

# Database Configuration
DATABASE_PATH=data/app.db

# API Server Configuration
PORT=3001
NODE_ENV=development

# Rate Limiting Configuration (optional)
REQUEST_DELAY_MS=0
MAX_RETRIES=16
INITIAL_BACKOFF_MS=1000
```

**Generating Secure Keys:**
```bash
# Generate SESSION_SECRET (64 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_KEY (64 hex characters = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Install Dependencies

```bash
npm install --registry https://registry.npmjs.org/ --cache ~/.npm
```

## Project Structure

```
/backend
  /lib                          - Shared library code
    config.js                   - Configuration management
    database.js                 - SQLite database layer for users and tokens
    encryption.js               - AES-256-GCM encryption for GitHub tokens
    passport-config.js          - Passport.js GitHub OAuth strategy
    auth-middleware.js          - Authentication and authorization middleware
    github-client.js            - GitHub REST API client
    github-contributions.js     - GitHub GraphQL client for PRs
    api-tracker.js              - API call tracking
  /api                          - REST API server
    server.js                   - Express server setup
    /routes
      auth.js                   - Authentication endpoints (OAuth flow)
      teams.js                  - Team-related endpoints
      prs.js                    - PR-related endpoints
      users.js                  - User-related endpoints
      contributions.js          - Contribution tracking endpoints
  /data                         - Database files (gitignored)
    app.db                      - User and token database
    sessions.db                 - Session storage
```

## Authentication Architecture

### Overview

The application uses **GitHub OAuth 2.0** for user authentication, with per-user token management and role-based access control.

### Key Components

1. **GitHub OAuth Flow** (`lib/passport-config.js`)
   - Uses Passport.js with passport-github2 strategy
   - Requests `read:org`, `repo`, and `read:user` scopes
   - Creates/updates user records on successful authentication
   - Encrypts and stores user's GitHub OAuth token

2. **User Database** (`lib/database.js`)
   - SQLite database with two tables: `users` and `tokens`
   - Users have roles: `user` (default) or `admin`
   - First user is automatically promoted to admin
   - Tokens are encrypted with AES-256-GCM before storage

3. **Token Encryption** (`lib/encryption.js`)
   - AES-256-GCM authenticated encryption
   - Per-token initialization vectors (IVs)
   - Encryption key from `ENCRYPTION_KEY` environment variable

4. **Session Management** (`api/server.js`)
   - express-session with SQLite store (connect-sqlite3)
   - HttpOnly cookies for XSS protection
   - 7-day session duration
   - Secure cookies in production

5. **Authentication Middleware** (`lib/auth-middleware.js`)
   - `requireAuth`: Ensures user is authenticated
   - `requireAdmin`: Ensures user has admin role
   - `attachUserToken`: Decrypts and injects user's GitHub token into request

### Authentication Flow

1. User clicks "Sign in with GitHub" on frontend
2. Frontend redirects to `/auth/github`
3. User authorizes application on GitHub
4. GitHub redirects to `/auth/github/callback` with code
5. Backend exchanges code for access token
6. Backend creates/updates user record
7. Backend encrypts and stores token in database
8. Backend creates session and redirects to frontend
9. Frontend makes API requests with session cookie
10. Backend decrypts user's token for GitHub API calls

### Token Fallback Strategy

- **Production**: All API requests require authenticated user with personal token
- **Development**: If user not authenticated, falls back to system token with warning logs
- **Fallback Warnings**: Console displays `⚠️  Unauthenticated request in dev mode, using system token`

### Role-Based Access Control

- **User Role**: Can access all standard API endpoints
- **Admin Role**: Can access admin-only endpoints (future use)
- **First User**: Automatically promoted to admin on first login
- **Role Changes**: Currently manual via database updates

## Usage

### Start the API Server

```bash
npm start
# or for development with auto-reload
npm run dev
```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

## API Endpoints

### Authentication Endpoints

All authentication endpoints are mounted at `/auth` (not `/api/auth`).

```
GET /auth/github
```
Initiates GitHub OAuth flow. Redirects to GitHub authorization page.

```
GET /auth/github/callback
```
GitHub OAuth callback. Handles authorization code exchange and creates session.

```
GET /auth/status
```
Check authentication status. Returns `{ authenticated: boolean, user: object }`.

```
GET /auth/user
```
Get current authenticated user. Returns user object or 401 if not authenticated.

```
POST /auth/logout
```
Logout current user. Destroys session and returns success message.

### Health Check

```
GET /health
```
Returns server status and configuration. **Public endpoint** (no authentication required).

### Protected API Endpoints

All `/api/*` endpoints require authentication (except `/health`).

#### Users

```
GET /api/users
```
Get all members in the organization.

#### Teams

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

#### Pull Requests

```
POST /api/prs/by-teams
Body: { "teamSlugs": ["team1", "team2"] }
```
Get open PRs for members of multiple teams, grouped by repository.

```
GET /api/prs/user/:username
```
Get open PRs for a specific user, grouped by repository.

#### Contributions

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

### Core Features

- **GitHub OAuth Authentication**: Secure user authentication with personal tokens
- **Per-User API Tokens**: Each user's GitHub token used for API requests
- **Token Encryption**: AES-256-GCM encryption for stored tokens
- **Session Management**: 7-day persistent sessions with SQLite storage
- **Role-Based Access**: User and admin roles with automatic first-user promotion
- **Rate Limiting**: Automatic retry with exponential backoff (configurable up to 16 retries)
- **API Call Tracking**: Each response includes `_meta` field with GitHub API usage stats
- **Pagination**: Automatically fetches multiple pages up to GitHub's limits
- **Error Propagation**: Proper HTTP status codes for rate limits and errors
- **GraphQL Batching**: Efficient bulk operations for open PRs
- **REST Search API**: Used for historical data (commits, reviews, PRs) to bypass GraphQL privacy restrictions

### Security Features

- **Encrypted Token Storage**: GitHub tokens encrypted at rest with AES-256-GCM
- **HttpOnly Cookies**: Session cookies inaccessible to JavaScript (XSS protection)
- **Secure Cookies**: HTTPS-only cookies in production
- **CORS Configuration**: Restricts cross-origin requests to frontend URL
- **Helmet.js**: HTTP security headers (XSS protection, content sniffing prevention, etc.)
- **Session Secrets**: Cryptographically secure session signing
- **Token-Scoped Requests**: Each user's API calls use their personal token

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Tokens Table

```sql
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

### Sessions Table

Managed automatically by connect-sqlite3.

## Requirements

- Node.js v20+ (v18+ may work but v20 recommended)
- GitHub OAuth App credentials
- GitHub Personal Access Token (fallback/system token)
- Access to the target GitHub organization

## Dependencies

### Authentication & Security

- `passport` ^0.7.0 - Authentication middleware
- `passport-github2` ^0.1.12 - GitHub OAuth 2.0 strategy
- `express-session` ^1.17.3 - Session management
- `connect-sqlite3` ^0.9.13 - SQLite session store
- `helmet` ^7.1.0 - HTTP security headers
- `better-sqlite3` ^9.2.2 - SQLite database driver

### GitHub API

- `@octokit/rest` - GitHub REST API client
- `@octokit/graphql` - GitHub GraphQL API client

### Core

- `express` - Web framework
- `cors` - CORS middleware
- `dotenv` - Environment variable management

## Configuration

Environment variables (`.env`):

```env
# GitHub Personal Access Token (system/fallback token)
GITHUB_TOKEN=your_token_here                  # Required

# GitHub Organization
GITHUB_ORG=your_org                           # Required

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_client_id               # Required
GITHUB_CLIENT_SECRET=your_client_secret       # Required
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback  # Required

# Security - Session Management
SESSION_SECRET=64_character_hex_string        # Required (generate with crypto)

# Security - Token Encryption (must be 64 hex characters = 32 bytes)
ENCRYPTION_KEY=64_character_hex_string        # Required (generate with crypto)

# Frontend URL (for CORS and OAuth redirects)
FRONTEND_URL=http://localhost:3000            # Required

# Database Configuration
DATABASE_PATH=data/app.db                     # Optional (default: data/app.db)

# API Server Configuration
PORT=3001                                     # Optional (default: 3001)
NODE_ENV=development                          # Optional (default: development)

# Rate Limiting Configuration
REQUEST_DELAY_MS=0                            # Optional (default: 0)
MAX_RETRIES=16                                # Optional (default: 16)
INITIAL_BACKOFF_MS=1000                       # Optional (default: 1000)
```

## Development

### Database Management

Database files are stored in `/data` directory (gitignored).

**View users:**
```bash
sqlite3 data/app.db "SELECT id, github_id, username, role, created_at FROM users;"
```

**Promote user to admin:**
```bash
sqlite3 data/app.db "UPDATE users SET role='admin' WHERE username='someuser';"
```

**View tokens (encrypted):**
```bash
sqlite3 data/app.db "SELECT user_id, scopes, created_at FROM tokens;"
```

### Logging

The server logs important events:

- `✅ User <username> authenticated successfully` - Successful login
- `👑 First user <username> promoted to admin` - First user promotion
- `⚠️  No token found for user <username>, using fallback system token` - Missing user token
- `⚠️  Unauthenticated request in dev mode, using system token` - Dev mode fallback

### Testing Authentication

1. Start backend: `npm start`
2. Start frontend: `cd ../frontend && npm run dev`
3. Navigate to `http://localhost:3000/login`
4. Click "Sign in with GitHub"
5. Authorize the application
6. Check backend logs for authentication success
7. Verify user in database: `sqlite3 data/app.db "SELECT * FROM users;"`

## Troubleshooting

### "No such table: users" Error

The database schema is automatically initialized on first startup. If you see this error:

1. Stop the server
2. Delete `data/app.db` and `data/sessions.db`
3. Restart the server - tables will be recreated

### "SQLITE_CANTOPEN" Error

Ensure the `data` directory exists:
```bash
mkdir -p data
```

### OAuth Callback URL Mismatch

Ensure your GitHub OAuth app's callback URL matches `GITHUB_CALLBACK_URL` in `.env`:
- Local development: `http://localhost:3001/auth/github/callback`
- Production: `https://yourdomain.com/auth/github/callback`

### Session Not Persisting

Check that:
1. `SESSION_SECRET` is set in `.env`
2. `data/sessions.db` is writable
3. Frontend includes credentials in requests (`credentials: 'include'`)
4. CORS is configured correctly (`FRONTEND_URL` matches frontend URL)

### Fallback Token Warnings

If you see `⚠️  Unauthenticated request in dev mode, using system token`:
- This is normal in development if accessing API directly
- In production, all requests must be authenticated
- Frontend should always send session cookies

## Notes

- Team names should match GitHub team slugs (lowercase, hyphenated)
- PRs are fetched using GraphQL for efficiency
- Historical contribution data uses REST Search API for better privacy handling
- All API responses include API call tracking in the `_meta` field
- First user to log in is automatically promoted to admin role
- OAuth tokens are encrypted with AES-256-GCM before storage
- Sessions expire after 7 days of inactivity
