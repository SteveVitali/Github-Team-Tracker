import express from 'express';
import { config } from '../../lib/config.js';
import { getTeamMembers } from '../../lib/github-client.js';
import { getOpenPRsForUsersGrouped } from '../../lib/github-contributions.js';

const router = express.Router();

/**
 * POST /api/prs/by-teams
 * Get open PRs for members of multiple teams
 * Body: { teamSlugs: string[] }
 */
router.post('/by-teams', async (req, res, next) => {
  try {
    const { teamSlugs } = req.body;

    if (!teamSlugs || !Array.isArray(teamSlugs) || teamSlugs.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'teamSlugs array is required and must not be empty',
      });
    }

    const allMembers = new Set();

    // Fetch all team members
    for (const teamSlug of teamSlugs) {
      const members = await getTeamMembers(config.GITHUB_ORG, teamSlug, req.userToken);

      for (const member of members) {
        allMembers.add(member.login);
      }
    }

    const usernames = Array.from(allMembers);

    // Use GraphQL to batch fetch all PRs efficiently
    const prsByUser = await getOpenPRsForUsersGrouped(usernames, config.GITHUB_ORG, req.userToken);

    // Transform to response format
    const userData = Object.entries(prsByUser)
      .filter(([_, data]) => !data.error && data.totalPRs > 0)
      .map(([username, data]) => ({
        username,
        avatarUrl: data.user.avatarUrl,
        totalPRs: data.totalPRs,
        repositories: data.repositories.map(repo => ({
          name: repo.name,
          prs: repo.prs.map(pr => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            state: pr.state,
            draft: pr.isDraft,
          })),
        })),
      }))
      .sort((a, b) => b.totalPRs - a.totalPRs);

    res.json({
      organization: config.GITHUB_ORG,
      teams: teamSlugs,
      memberCount: usernames.length,
      usersWithPRs: userData.length,
      totalPRs: userData.reduce((sum, user) => sum + user.totalPRs, 0),
      users: userData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/prs/user/:username
 * Get open PRs for a specific user
 */
router.get('/user/:username', async (req, res, next) => {
  try {
    const { username } = req.params;

    // Use GraphQL for efficient fetching
    const prsByUser = await getOpenPRsForUsersGrouped([username], config.GITHUB_ORG, req.userToken);
    const data = prsByUser[username];

    if (data.error) {
      return res.status(500).json({
        error: data.error,
      });
    }

    res.json({
      organization: config.GITHUB_ORG,
      username,
      user: data.user,
      totalPRs: data.totalPRs,
      repositories: data.repositories.map(repo => ({
        name: repo.name,
        count: repo.prs.length,
        prs: repo.prs.map(pr => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          repository: pr.repository,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          state: pr.state,
          draft: pr.isDraft,
        })),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
