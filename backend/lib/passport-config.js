import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { config } from './config.js';
import { encryptToken } from './encryption.js';
import { upsertUserWithToken, userQueries } from './database.js';

/**
 * Configure Passport with GitHub OAuth Strategy
 */
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = userQueries.findById.get(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GitHubStrategy(
    {
      clientID: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      callbackURL: config.GITHUB_CALLBACK_URL,
      scope: ['read:org', 'repo', 'read:user'],
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        // Encrypt the access token
        const { encryptedToken, iv } = encryptToken(accessToken);

        // Check if this is the first user (should be admin)
        const allUsers = userQueries.getAll.all();
        const isFirstUser = allUsers.length === 0;

        // Store user and encrypted token
        const user = upsertUserWithToken(
          profile,
          accessToken,
          encryptedToken,
          iv,
          ['read:org', 'repo', 'read:user']
        );

        // Promote first user to admin
        if (isFirstUser) {
          userQueries.updateRole.run('admin', user.id);
          user.role = 'admin';
          console.log(`👑 First user ${user.username} promoted to admin`);
        }

        console.log(`✅ User ${user.username} authenticated successfully`);
        return done(null, user);
      } catch (error) {
        console.error('OAuth authentication error:', error);
        return done(error, null);
      }
    }
  )
);

export default passport;
