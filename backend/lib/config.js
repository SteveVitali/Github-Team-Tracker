import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '..');
dotenv.config({ path: join(backendDir, '.env') });

export const config = {
  // GitHub API (system/fallback token)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_ORG: process.env.GITHUB_ORG || 'foursquare',

  // GitHub OAuth
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback',

  // Security
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,

  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  // API Configuration
  REQUEST_DELAY_MS: parseInt(process.env.REQUEST_DELAY_MS || '0'),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '16'),
  INITIAL_BACKOFF_MS: parseInt(process.env.INITIAL_BACKOFF_MS || '1000'),

  // Database
  DATABASE_PATH: process.env.DATABASE_PATH,
};

export function validateConfig() {
  if (!config.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Please create a .env file with your GitHub token');
    process.exit(1);
  }
}
