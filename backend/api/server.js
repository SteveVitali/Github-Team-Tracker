import express from 'express';
import cors from 'cors';
import { config, validateConfig } from '../lib/config.js';
import { initializeTracking, getTrackingData } from '../lib/api-tracker.js';
import teamsRouter from './routes/teams.js';
import prsRouter from './routes/prs.js';
import usersRouter from './routes/users.js';
import contributionsRouter from './routes/contributions.js';

// Validate configuration on startup
validateConfig();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    organization: config.GITHUB_ORG
  });
});

// API routes
app.use('/api/teams', teamsRouter);
app.use('/api/prs', prsRouter);
app.use('/api/users', usersRouter);
app.use('/api/contributions', contributionsRouter);

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
  console.log(`   GET  /health`);
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
