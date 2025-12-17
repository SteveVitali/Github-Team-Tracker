import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '..');

// Ensure data directory exists
const dataDir = join(backendDir, 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Database path
const DB_PATH = process.env.DATABASE_PATH || join(dataDir, 'github-tracker.db');

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better concurrency

// Initialize database schema immediately
function initSchema() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
  `);

  // Create tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      encrypted_token TEXT NOT NULL,
      token_iv TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create index on user_id for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id)
  `);

  // Create trigger to update updated_at
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_users_updated_at
    AFTER UPDATE ON users
    BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
}

// Initialize schema before creating prepared statements
initSchema();

/**
 * Initialize database schema (called from server startup for logging)
 */
export function initializeDatabase() {
  console.log('✅ Database initialized successfully');
}

/**
 * User database operations
 */
export const userQueries = {
  /**
   * Find user by GitHub ID
   */
  findByGithubId: db.prepare(`
    SELECT * FROM users WHERE github_id = ?
  `),

  /**
   * Find user by username
   */
  findByUsername: db.prepare(`
    SELECT * FROM users WHERE username = ?
  `),

  /**
   * Find user by ID
   */
  findById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),

  /**
   * Create a new user
   */
  create: db.prepare(`
    INSERT INTO users (github_id, username, email, name, avatar_url, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  /**
   * Update user information
   */
  update: db.prepare(`
    UPDATE users
    SET username = ?, email = ?, name = ?, avatar_url = ?
    WHERE id = ?
  `),

  /**
   * Update user role
   */
  updateRole: db.prepare(`
    UPDATE users SET role = ? WHERE id = ?
  `),

  /**
   * Get all users
   */
  getAll: db.prepare(`
    SELECT * FROM users ORDER BY created_at DESC
  `),
};

/**
 * Token database operations
 */
export const tokenQueries = {
  /**
   * Find token by user ID
   */
  findByUserId: db.prepare(`
    SELECT * FROM tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `),

  /**
   * Create a new token
   */
  create: db.prepare(`
    INSERT INTO tokens (user_id, encrypted_token, token_iv, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `),

  /**
   * Update token
   */
  update: db.prepare(`
    UPDATE tokens
    SET encrypted_token = ?, token_iv = ?, scopes = ?, expires_at = ?
    WHERE user_id = ?
  `),

  /**
   * Delete token by user ID
   */
  deleteByUserId: db.prepare(`
    DELETE FROM tokens WHERE user_id = ?
  `),

  /**
   * Delete expired tokens
   */
  deleteExpired: db.prepare(`
    DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `),
};

/**
 * Helper function to create or update user and token
 */
export function upsertUserWithToken(profile, accessToken, encryptedToken, tokenIv, scopes) {
  const transaction = db.transaction(() => {
    // Check if user exists
    let user = userQueries.findByGithubId.get(profile.id);

    if (user) {
      // Update existing user
      userQueries.update.run(
        profile.username,
        profile.email || profile.emails?.[0]?.value || null,
        profile.displayName || profile._json?.name || null,
        profile._json?.avatar_url || profile.photos?.[0]?.value || null,
        user.id
      );
    } else {
      // Create new user
      const result = userQueries.create.run(
        profile.id,
        profile.username,
        profile.email || profile.emails?.[0]?.value || null,
        profile.displayName || profile._json?.name || null,
        profile._json?.avatar_url || profile.photos?.[0]?.value || null,
        'user' // Default role
      );
      user = userQueries.findById.get(result.lastInsertRowid);
    }

    // Upsert token
    const existingToken = tokenQueries.findByUserId.get(user.id);
    if (existingToken) {
      tokenQueries.update.run(
        encryptedToken,
        tokenIv,
        scopes.join(','),
        null, // GitHub tokens don't expire unless revoked
        user.id
      );
    } else {
      tokenQueries.create.run(
        user.id,
        encryptedToken,
        tokenIv,
        scopes.join(','),
        null
      );
    }

    return user;
  });

  return transaction();
}

/**
 * Clean up expired tokens periodically
 */
export function cleanupExpiredTokens() {
  const result = tokenQueries.deleteExpired.run();
  if (result.changes > 0) {
    console.log(`🧹 Cleaned up ${result.changes} expired tokens`);
  }
}

// Run cleanup on startup
cleanupExpiredTokens();

// Schedule cleanup every 24 hours
setInterval(cleanupExpiredTokens, 24 * 60 * 60 * 1000);

export default db;
