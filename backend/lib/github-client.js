import { Octokit } from '@octokit/rest';
import { config } from './config.js';
import { trackApiCall } from './api-tracker.js';
import { getConcurrencyState } from '../api/server.js';

// Default Octokit instance with system token
const defaultOctokit = new Octokit({
  auth: config.GITHUB_TOKEN,
});

/**
 * Get an Octokit instance with the specified token
 * Falls back to default instance if no token provided
 */
function getOctokit(token) {
  if (token && token !== config.GITHUB_TOKEN) {
    return new Octokit({ auth: token });
  }
  return defaultOctokit;
}

// Utility function to delay execution
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
async function retryWithBackoff(fn, retries = config.MAX_RETRIES, backoff = config.INITIAL_BACKOFF_MS) {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }

    // Check if it's a rate limit error
    if (error.status === 403 || error.status === 429) {
      const waitTime = error.response?.headers?.['retry-after']
        ? parseInt(error.response.headers['retry-after']) * 1000
        : backoff;

      const state = getConcurrencyState();
      console.log(`⏳ Rate limit hit, waiting ${Math.round(waitTime / 1000)}s before retry... [active: ${state.active}/${state.max}, queued: ${state.queued}]`);
      await sleep(waitTime);
      return retryWithBackoff(fn, retries - 1, backoff * 2);
    }

    // For other errors, throw immediately
    throw error;
  }
}

// Throttle requests to avoid hitting rate limits
async function throttledRequest(fn) {
  if (config.REQUEST_DELAY_MS > 0) {
    await sleep(config.REQUEST_DELAY_MS);
  }
  return retryWithBackoff(fn);
}

/**
 * Get all members of an organization (with pagination)
 */
export async function getAllOrgMembers(org, token = null) {
  try {
    const client = getOctokit(token);
    const members = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      trackApiCall('REST:orgs.listMembers');
      const response = await throttledRequest(() =>
        client.rest.orgs.listMembers({
          org,
          per_page: 100,
          page,
        })
      );

      members.push(...response.data);
      hasMore = response.data.length === 100;
      page++;
    }

    return members;
  } catch (error) {
    console.error(`Error fetching org members:`, error.message);
    return [];
  }
}

/**
 * List all available teams in an organization
 */
export async function listAvailableTeams(org, token = null) {
  try {
    const client = getOctokit(token);
    trackApiCall('REST:teams.list');
    const response = await throttledRequest(() =>
      client.rest.teams.list({
        org,
        per_page: 100,
      })
    );
    return response.data;
  } catch (error) {
    console.error(`Error listing teams:`, error.message);
    return null;
  }
}

/**
 * Get all teams in an organization (with pagination)
 */
export async function getAllTeams(org, token = null) {
  try {
    const client = getOctokit(token);
    const teams = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      trackApiCall('REST:teams.list');
      const response = await throttledRequest(() =>
        client.rest.teams.list({
          org,
          per_page: 100,
          page,
        })
      );

      teams.push(...response.data);
      hasMore = response.data.length === 100;
      page++;
    }

    return teams;
  } catch (error) {
    console.error(`Error fetching teams:`, error.message);
    return [];
  }
}

/**
 * Get members of a specific team
 */
export async function getTeamMembers(org, teamSlug, token = null) {
  try {
    const client = getOctokit(token);
    const members = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      trackApiCall('REST:teams.listMembersInOrg');
      const response = await throttledRequest(() =>
        client.rest.teams.listMembersInOrg({
          org,
          team_slug: teamSlug,
          per_page: 100,
          page,
        })
      );

      members.push(...response.data);
      hasMore = response.data.length === 100;
      page++;
    }

    return members;
  } catch (error) {
    if (error.status === 404) {
      console.error(`\n❌ Team '${teamSlug}' not found in organization '${org}'`);
    } else if (error.status === 401 || error.status === 403) {
      console.error(`\n❌ Authentication error for team '${teamSlug}'`);
      console.error(`   Your token may not have the required permissions.`);
      console.error(`   Required scopes: read:org, repo`);
      console.error(`\n   Attempting to list available teams...`);

      const teams = await listAvailableTeams(org, token);
      if (teams && teams.length > 0) {
        console.error(`\n   Available teams you have access to:`);
        teams.forEach(team => {
          console.error(`   - ${team.slug} (${team.name})`);
        });
      } else {
        console.error(`   Could not list teams. You may need to:`);
        console.error(`   1. Regenerate your token with 'read:org' and 'repo' scopes`);
        console.error(`   2. Verify you have access to the '${org}' organization`);
        console.error(`   3. Check that you're a member of the teams you're querying`);
      }
    } else {
      console.error(`\n❌ Error fetching members for team ${teamSlug}:`, error.message);
    }
    return [];
  }
}

/**
 * Get open pull requests for a user in an organization
 */
export async function getUserPullRequests(org, username, token = null) {
  try {
    const client = getOctokit(token);
    trackApiCall('REST:search.issuesAndPullRequests');
    const query = `org:${org} author:${username} is:pr is:open`;
    const response = await throttledRequest(() =>
      client.rest.search.issuesAndPullRequests({
        q: query,
        per_page: 100,
        sort: 'updated',
        order: 'desc',
      })
    );

    return response.data.items;
  } catch (error) {
    if (error.status === 403 || error.status === 429) {
      const state = getConcurrencyState();
      console.error(`⚠️  Rate limit exceeded for user ${username}, skipping... [active: ${state.active}/${state.max}, queued: ${state.queued}]`);
    } else {
      console.error(`Error fetching PRs for user ${username}:`, error.message);
    }
    return [];
  }
}

/**
 * Group pull requests by repository
 */
export function groupPRsByRepo(prs) {
  const grouped = {};

  for (const pr of prs) {
    const repoName = pr.repository_url.split('/').slice(-1)[0];
    if (!grouped[repoName]) {
      grouped[repoName] = [];
    }
    grouped[repoName].push(pr);
  }

  return grouped;
}

/**
 * Search for commits by a user in an organization within a date range
 * Note: GitHub Search API has a hard limit of 1000 total results
 */
export async function searchUserCommits(org, username, fromDate, toDate, token = null) {
  const client = getOctokit(token);

  // Format dates for GitHub search (YYYY-MM-DD)
  const from = fromDate.toISOString().split('T')[0];
  const to = toDate.toISOString().split('T')[0];

  const query = `org:${org} author:${username} committer-date:${from}..${to}`;

  const allCommits = [];
  let page = 1;
  let hasMore = true;

  // GitHub Search API limits to 1000 total results (10 pages of 100)
  while (hasMore && page <= 10) {
    trackApiCall('REST:search.commits');
    const response = await throttledRequest(() =>
      client.rest.search.commits({
        q: query,
        per_page: 100,
        page,
        sort: 'committer-date',
        order: 'desc',
      })
    );

    allCommits.push(...response.data.items);

    // Check if there are more results
    hasMore = response.data.items.length === 100 && response.data.total_count > allCommits.length;
    page++;
  }

  return allCommits;
}

/**
 * Search for PR reviews by a user in an organization
 * Note: GitHub Search API has a hard limit of 1000 total results
 */
export async function searchUserReviews(org, username, fromDate, toDate, token = null) {
  const client = getOctokit(token);

  // Format dates for GitHub search
  const from = fromDate.toISOString().split('T')[0];
  const to = toDate.toISOString().split('T')[0];

  // Search for PRs that the user reviewed
  const query = `org:${org} is:pr reviewed-by:${username} updated:${from}..${to}`;

  const allReviews = [];
  let page = 1;
  let hasMore = true;

  // GitHub Search API limits to 1000 total results (10 pages of 100)
  while (hasMore && page <= 10) {
    trackApiCall('REST:search.issuesAndPullRequests');
    const response = await throttledRequest(() =>
      client.rest.search.issuesAndPullRequests({
        q: query,
        per_page: 100,
        page,
        sort: 'updated',
        order: 'desc',
      })
    );

    allReviews.push(...response.data.items);

    // Check if there are more results
    hasMore = response.data.items.length === 100 && response.data.total_count > allReviews.length;
    page++;
  }

  return allReviews;
}

/**
 * Search for PRs created by a user in an organization within a date range
 * Note: GitHub Search API has a hard limit of 1000 total results
 */
export async function searchUserPRs(org, username, fromDate, toDate, token = null) {
  const client = getOctokit(token);

  // Format dates for GitHub search
  const from = fromDate.toISOString().split('T')[0];
  const to = toDate.toISOString().split('T')[0];

  // Search for PRs authored by the user
  const query = `org:${org} is:pr author:${username} created:${from}..${to}`;

  const allPRs = [];
  let page = 1;
  let hasMore = true;

  // GitHub Search API limits to 1000 total results (10 pages of 100)
  while (hasMore && page <= 10) {
    trackApiCall('REST:search.issuesAndPullRequests');
    const response = await throttledRequest(() =>
      client.rest.search.issuesAndPullRequests({
        q: query,
        per_page: 100,
        page,
        sort: 'created',
        order: 'desc',
      })
    );

    allPRs.push(...response.data.items);

    // Check if there are more results
    hasMore = response.data.items.length === 100 && response.data.total_count > allPRs.length;
    page++;
  }

  return allPRs;
}

/**
 * Format a date string in a human-readable way
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toISOString().split('T')[0];
  }
}
