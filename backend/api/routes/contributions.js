import express from 'express';
import { config } from '../../lib/config.js';
import { searchUserCommits, searchUserReviews, searchUserPRs } from '../../lib/github-client.js';

const router = express.Router();

/**
 * GET /api/contributions/user/:username/commits
 * Get commits by a user in the last month (or custom date range via query params)
 * Query params:
 *   - from: Date string (optional, defaults to 30 days ago)
 *   - to: Date string (optional, defaults to now)
 *   - days: Number (optional, defaults to 30)
 */
router.get('/user/:username/commits', async (req, res, next) => {
  try {
    const { username } = req.params;
    const { from, to, days } = req.query;
    const orgLogin = config.GITHUB_ORG;

    let fromDate, toDate;

    if (from && to) {
      fromDate = new Date(from);
      toDate = new Date(to);
    } else {
      const lookbackDays = days ? parseInt(days) : 30;
      toDate = new Date();
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - lookbackDays);
    }

    const commits = await searchUserCommits(orgLogin, username, fromDate, toDate, req.userToken);

    res.json({
      organization: orgLogin,
      username,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      count: commits.length,
      commits: commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: commit.commit.author.date,
        },
        committer: {
          name: commit.commit.committer.name,
          date: commit.commit.committer.date,
        },
        repository: {
          name: commit.repository.name,
          fullName: commit.repository.full_name,
          url: commit.repository.html_url,
        },
        url: commit.html_url,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/contributions/user/:username/reviews
 * Get PR reviews by a user in the last month (or custom date range via query params)
 * Query params:
 *   - from: Date string (optional, defaults to 30 days ago)
 *   - to: Date string (optional, defaults to now)
 *   - days: Number (optional, defaults to 30)
 */
router.get('/user/:username/reviews', async (req, res, next) => {
  try {
    const { username } = req.params;
    const { from, to, days } = req.query;
    const orgLogin = config.GITHUB_ORG;

    let fromDate, toDate;

    if (from && to) {
      fromDate = new Date(from);
      toDate = new Date(to);
    } else {
      const lookbackDays = days ? parseInt(days) : 30;
      toDate = new Date();
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - lookbackDays);
    }

    const reviews = await searchUserReviews(orgLogin, username, fromDate, toDate, req.userToken);

    res.json({
      organization: orgLogin,
      username,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      count: reviews.length,
      reviews: reviews.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        repository: pr.repository_url.split('/').slice(-1)[0],
        repositoryUrl: pr.repository_url,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/contributions/user/:username/prs
 * Get all PRs (open and closed) created by a user in the given period
 * Query params:
 *   - from: Date string (optional, defaults to 30 days ago)
 *   - to: Date string (optional, defaults to now)
 *   - days: Number (optional, defaults to 30)
 */
router.get('/user/:username/prs', async (req, res, next) => {
  try {
    const { username } = req.params;
    const { from, to, days } = req.query;
    const orgLogin = config.GITHUB_ORG;

    let fromDate, toDate;

    if (from && to) {
      fromDate = new Date(from);
      toDate = new Date(to);
    } else {
      const lookbackDays = days ? parseInt(days) : 30;
      toDate = new Date();
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - lookbackDays);
    }

    const prs = await searchUserPRs(orgLogin, username, fromDate, toDate, req.userToken);

    res.json({
      organization: orgLogin,
      username,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      count: prs.length,
      prs: prs.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        mergedAt: pr.pull_request?.merged_at || null,
        repository: pr.repository_url.split('/').slice(-1)[0],
        repositoryUrl: pr.repository_url,
        labels: pr.labels.map(l => l.name),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
