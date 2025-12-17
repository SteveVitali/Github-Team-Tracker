import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '..');
dotenv.config({ path: join(backendDir, '.env') });

export const config = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_ORG: process.env.GITHUB_ORG || 'foursquare',
  REQUEST_DELAY_MS: parseInt(process.env.REQUEST_DELAY_MS || '0'),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '16'),
  INITIAL_BACKOFF_MS: parseInt(process.env.INITIAL_BACKOFF_MS || '1000'),
};

export function validateConfig() {
  if (!config.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Please create a .env file with your GitHub token');
    process.exit(1);
  }
}
