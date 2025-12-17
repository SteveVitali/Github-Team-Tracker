import express from 'express';
import { config } from '../../lib/config.js';
import {
  getAllTeams,
  getTeamMembers,
} from '../../lib/github-client.js';
import { getOpenPRsForUsers } from '../../lib/github-contributions.js';

const router = express.Router();

/**
 * GET /api/teams
 * Get all teams in the organization
 */
router.get('/', async (req, res, next) => {
  try {
    const teams = await getAllTeams(config.GITHUB_ORG);

    res.json({
      organization: config.GITHUB_ORG,
      count: teams.length,
      teams: teams.map(team => ({
        id: team.id,
        slug: team.slug,
        name: team.name,
        description: team.description,
        privacy: team.privacy,
        membersCount: team.members_count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/teams/:teamSlug/members
 * Get members of a specific team
 */
router.get('/:teamSlug/members', async (req, res, next) => {
  try {
    const { teamSlug } = req.params;
    const members = await getTeamMembers(config.GITHUB_ORG, teamSlug);

    res.json({
      organization: config.GITHUB_ORG,
      team: teamSlug,
      count: members.length,
      members: members.map(member => ({
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

/**
 * GET /api/teams/:teamSlug/prs
 * Get all open PRs for members of a specific team
 */
router.get('/:teamSlug/prs', async (req, res, next) => {
  try {
    const { teamSlug } = req.params;

    // Get team members
    const members = await getTeamMembers(config.GITHUB_ORG, teamSlug);
    const usernames = members.map(m => m.login);

    // Use GraphQL to batch fetch all PRs efficiently
    const prsByUser = await getOpenPRsForUsers(usernames, config.GITHUB_ORG);

    // Transform to response format
    const userData = Object.entries(prsByUser)
      .filter(([_, data]) => !data.error && data.totalPRs > 0)
      .map(([username, data]) => ({
        username,
        avatarUrl: data.user.avatarUrl,
        totalPRs: data.totalPRs,
        prs: data.pullRequests.map(pr => ({
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
      }))
      .sort((a, b) => b.totalPRs - a.totalPRs);

    res.json({
      organization: config.GITHUB_ORG,
      team: teamSlug,
      memberCount: members.length,
      usersWithPRs: userData.length,
      totalPRs: userData.reduce((sum, user) => sum + user.totalPRs, 0),
      users: userData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/teams/membership-report
 * Get a report of all users and their team memberships
 */
router.get('/membership-report', async (req, res, next) => {
  try {
    // Fetch all teams
    const teams = await getAllTeams(config.GITHUB_ORG);

    // Map of username -> list of teams
    const userTeams = new Map();

    // Fetch members for each team
    for (const team of teams) {
      const members = await getTeamMembers(config.GITHUB_ORG, team.slug);

      for (const member of members) {
        if (!userTeams.has(member.login)) {
          userTeams.set(member.login, {
            id: member.id,
            login: member.login,
            avatarUrl: member.avatar_url,
            teams: [],
          });
        }
        userTeams.get(member.login).teams.push({
          slug: team.slug,
          name: team.name,
        });
      }
    }

    // Convert to array and sort by username
    const users = Array.from(userTeams.values()).sort((a, b) =>
      a.login.localeCompare(b.login)
    );

    res.json({
      organization: config.GITHUB_ORG,
      totalTeams: teams.length,
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
