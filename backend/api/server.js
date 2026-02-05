import express from 'express';
import session from 'express-session';
import ConnectSqlite3 from 'connect-sqlite3';
import helmet from 'helmet';
import passport from '../lib/passport-config.js';
import { config, validateConfig } from '../lib/config.js';
import { initializeDatabase } from '../lib/database.js';
import { initializeTracking, getTrackingData } from '../lib/api-tracker.js';
import { attachUserToken, requireAuth } from '../lib/auth-middleware.js';
import authRouter from './routes/auth.js';
import teamsRouter from './routes/teams.js';
import prsRouter from './routes/prs.js';
import usersRouter from './routes/users.js';
import contributionsRouter from './routes/contributions.js';

// Validate configuration on startup
validateConfig();

// Initialize database on startup
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

// Manual CORS middleware to ensure credentials header is always set
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) {
    return next();
  }

  // Allow any localhost port (for development) or the configured frontend URL
  const isLocalhost = origin.startsWith('http://localhost:');
  const isAllowedOrigin = isLocalhost || origin === config.FRONTEND_URL;

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'set-cookie');
    res.setHeader('Vary', 'Origin');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }

  next();
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(express.json());

// Session configuration
const SQLiteStore = ConnectSqlite3(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './data'
  }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Passport authentication
app.use(passport.initialize());
app.use(passport.session());

// Concurrent request tracking and queueing
let activeRequests = 0;
let peakConcurrentRequests = 0;
const requestQueue = [];

// Export function to get current concurrency state (for logging from other modules)
export function getConcurrencyState() {
  return {
    active: activeRequests,
    queued: requestQueue.length,
    max: config.MAX_CONCURRENT_REQUESTS,
    peak: peakConcurrentRequests
  };
}

// Process next request from queue
function processQueue() {
  if (requestQueue.length > 0 && activeRequests < config.MAX_CONCURRENT_REQUESTS) {
    const next = requestQueue.shift();
    next();
  }
}

// Request queueing middleware with concurrency control
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Function to continue processing this request
  const continueRequest = () => {
    activeRequests++;
    if (activeRequests > peakConcurrentRequests) {
      peakConcurrentRequests = activeRequests;
    }

    const queueTime = Date.now() - start;
    if (queueTime > 0) {
      console.log(`[${requestId}] ${req.method} ${req.path} - queued for ${queueTime}ms [active: ${activeRequests}/${config.MAX_CONCURRENT_REQUESTS}, queued: ${requestQueue.length}]`);
    }

    res.on('finish', () => {
      activeRequests--;
      const duration = Date.now() - start;
      console.log(`[${requestId}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms [active: ${activeRequests + 1}→${activeRequests}, peak: ${peakConcurrentRequests}]`);

      // Process next queued request
      processQueue();
    });

    next();
  };

  // If we have capacity, process immediately
  if (activeRequests < config.MAX_CONCURRENT_REQUESTS) {
    continueRequest();
  } else {
    // Otherwise, queue the request
    console.log(`[${requestId}] ${req.method} ${req.path} - queuing request [active: ${activeRequests}/${config.MAX_CONCURRENT_REQUESTS}, queued: ${requestQueue.length}]`);
    requestQueue.push(continueRequest);
  }
});

// Initialize API call tracking for each request
app.use((req, res, next) => {
  initializeTracking();
  next();
});

// Middleware to inject tracking data into all JSON responses
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const tracking = getTrackingData();
    const enrichedData = {
      ...data,
      _meta: {
        githubApiCalls: tracking.apiCalls,
        totalGithubCalls: tracking.totalCalls
      }
    };
    return originalJson(enrichedData);
  };
  next();
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    organization: config.GITHUB_ORG
  });
});

// Auth routes (public)
app.use('/auth', authRouter);

// Attach user tokens to all API requests
app.use('/api', attachUserToken);

// Protected API routes (require authentication)
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/prs', requireAuth, prsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/contributions', requireAuth, contributionsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 GitHub Team Tracker API Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`🏢 Organization: ${config.GITHUB_ORG}`);
  console.log(`\n📚 Available endpoints:`);
  console.log(`\n  Public:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /auth/status`);
  console.log(`   GET  /auth/github`);
  console.log(`   GET  /auth/github/callback`);
  console.log(`\n  Authenticated:`);
  console.log(`   GET  /auth/user`);
  console.log(`   POST /auth/logout`);
  console.log(`   GET  /api/users`);
  console.log(`   GET  /api/teams`);
  console.log(`   GET  /api/teams/:teamSlug/members`);
  console.log(`   GET  /api/teams/:teamSlug/prs`);
  console.log(`   GET  /api/teams/membership-report`);
  console.log(`   POST /api/prs/by-teams`);
  console.log(`   GET  /api/prs/user/:username`);
  console.log(`   GET  /api/contributions/user/:username/commits`);
  console.log(`   GET  /api/contributions/user/:username/reviews`);
  console.log(`   GET  /api/contributions/user/:username/prs`);
  console.log(`\nPress Ctrl+C to stop\n`);
});

export default app;
