import { config } from './config.js';
import { tokenQueries } from './database.js';
import { decryptToken } from './encryption.js';

/**
 * Require authentication for a route
 * Returns 401 if user is not authenticated
 * Accepts both OAuth session and Bearer token (PAT) authentication
 */
export function requireAuth(req, res, next) {
  // Check for Bearer token in Authorization header (PAT auth)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // PAT authentication - considered authenticated
    return next();
  }

  // Check OAuth session authentication
  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({
    error: 'Authentication required',
    message: 'Please log in to access this resource'
  });
}

/**
 * Require admin role
 * Returns 403 if user is not an admin
 */
export function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (req.user.role === 'admin') {
    return next();
  }

  res.status(403).json({
    error: 'Admin access required',
    message: 'You do not have permission to access this resource'
  });
}

/**
 * Attach user's GitHub token to the request
 * Falls back to system token with warning if user token not found
 */
export function attachUserToken(req, res, next) {
  // First check for Authorization header with Bearer token (PAT auth)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    req.userToken = token;
    req.tokenSource = 'pat';
    console.log('🔑 Using PAT from Authorization header');
    return next();
  }

  // Otherwise proceed with OAuth session-based auth
  if (req.isAuthenticated()) {
    try {
      // Fetch and decrypt user's token
      const tokenRecord = tokenQueries.findByUserId.get(req.user.id);

      if (tokenRecord) {
        const decryptedToken = decryptToken(
          tokenRecord.encrypted_token,
          tokenRecord.token_iv
        );
        req.userToken = decryptedToken;
        req.tokenSource = 'user';
      } else {
        // Token not found - use fallback
        console.warn(`⚠️  No token found for user ${req.user.username}, using fallback system token`);
        req.userToken = config.GITHUB_TOKEN;
        req.tokenSource = 'fallback';
      }
    } catch (error) {
      // Decryption failed - use fallback
      console.error(`❌ Failed to decrypt token for user ${req.user.username}:`, error.message);
      console.warn(`⚠️  Using fallback system token`);
      req.userToken = config.GITHUB_TOKEN;
      req.tokenSource = 'fallback';
    }
  } else {
    // Not authenticated - in dev, use system token
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`⚠️  Unauthenticated request in dev mode, using system token`);
      req.userToken = config.GITHUB_TOKEN;
      req.tokenSource = 'system-dev';
    }
  }

  next();
}

/**
 * Optional authentication - attach token if authenticated, but don't require it
 * Useful for endpoints that work better with auth but don't strictly require it
 */
export function optionalAuth(req, res, next) {
  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    attachUserToken(req, res, next);
  } else if (req.isAuthenticated()) {
    attachUserToken(req, res, next);
  } else {
    next();
  }
}
