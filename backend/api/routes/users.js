import express from 'express';
import { config } from '../../lib/config.js';
import { getAllOrgMembers } from '../../lib/github-client.js';

const router = express.Router();

/**
 * GET /api/users
 * Get all users (members) in the organization
 */
router.get('/', async (req, res, next) => {
  try {
    const members = await getAllOrgMembers(config.GITHUB_ORG);

    res.json({
      organization: config.GITHUB_ORG,
      count: members.length,
      users: members.map(member => ({
        id: member.id,
        login: member.login,
        avatarUrl: member.avatar_url,
        type: member.type,
        siteAdmin: member.site_admin,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
