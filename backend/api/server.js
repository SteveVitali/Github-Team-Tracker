import express from 'express';
import cors from 'cors';
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

// Security middleware
app.use(helmet());

// CORS - Allow credentials for session cookies
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true
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

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
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
