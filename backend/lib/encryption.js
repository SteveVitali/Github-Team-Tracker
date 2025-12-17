import crypto from 'crypto';

// Encryption key must be 32 bytes for AES-256
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required');
}

// Ensure key is exactly 32 bytes
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
}

/**
 * Encrypt a GitHub access token
 * Uses AES-256-GCM for authenticated encryption
 *
 * @param {string} token - The GitHub access token to encrypt
 * @returns {{ encryptedToken: string, iv: string }} Encrypted token and IV (both hex-encoded)
 */
export function encryptToken(token) {
  // Generate a random initialization vector (IV)
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  // Encrypt the token
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the auth tag
  const authTag = cipher.getAuthTag();

  // Combine encrypted data and auth tag
  const encryptedWithTag = encrypted + authTag.toString('hex');

  return {
    encryptedToken: encryptedWithTag,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a GitHub access token
 *
 * @param {string} encryptedToken - The encrypted token (hex-encoded)
 * @param {string} iv - The initialization vector (hex-encoded)
 * @returns {string} The decrypted GitHub access token
 */
export function decryptToken(encryptedToken, iv) {
  try {
    // Convert IV from hex
    const ivBuffer = Buffer.from(iv, 'hex');

    // Split encrypted data and auth tag (last 32 hex chars = 16 bytes)
    const authTag = Buffer.from(encryptedToken.slice(-32), 'hex');
    const encrypted = encryptedToken.slice(0, -32);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
    decipher.setAuthTag(authTag);

    // Decrypt the token
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt token:', error.message);
    throw new Error('Token decryption failed');
  }
}

/**
 * Generate a secure encryption key
 * Use this to generate a new ENCRYPTION_KEY value for .env
 * Run: node -e "import('./lib/encryption.js').then(m => console.log(m.generateEncryptionKey()))"
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate encryption key format
 */
export function validateEncryptionKey(key) {
  try {
    const buffer = Buffer.from(key, 'hex');
    return buffer.length === 32;
  } catch {
    return false;
  }
}
