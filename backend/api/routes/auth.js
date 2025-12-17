import express from 'express';
import passport from '../../lib/passport-config.js';
import { config } from '../../lib/config.js';

const router = express.Router();

/**
 * GET /auth/github
 * Start GitHub OAuth flow
 */
router.get('/github', passport.authenticate('github', {
  scope: ['read:org', 'repo', 'read:user']
}));

/**
 * GET /auth/github/callback
 * GitHub OAuth callback
 */
router.get('/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${config.FRONTEND_URL}/login?error=auth_failed`
  }),
  (req, res) => {
    // Successful authentication - redirect to frontend
    console.log(`✅ User ${req.user.username} logged in successfully`);
    res.redirect(config.FRONTEND_URL);
  }
);

/**
 * GET /auth/user
 * Get current authenticated user
 */
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      user: {
        id: req.user.id,
        githubId: req.user.github_id,
        username: req.user.username,
        email: req.user.email,
        name: req.user.name,
        avatarUrl: req.user.avatar_url,
        role: req.user.role,
        createdAt: req.user.created_at
      }
    });
  } else {
    res.status(401).json({
      error: 'Not authenticated',
      message: 'Please log in to continue'
    });
  }
});

/**
 * POST /auth/logout
 * Log out current user
 */
router.post('/logout', (req, res) => {
  const username = req.user?.username;

  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        error: 'Logout failed',
        message: 'An error occurred while logging out'
      });
    }

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }

      if (username) {
        console.log(`👋 User ${username} logged out`);
      }

      res.json({
        message: 'Logged out successfully'
      });
    });
  });
});

/**
 * GET /auth/status
 * Check authentication status (public endpoint)
 */
router.get('/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      username: req.user.username,
      role: req.user.role
    } : null
  });
});

export default router;
