import { graphql } from '@octokit/graphql';
import { config } from './config.js';
import { trackApiCall } from './api-tracker.js';

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${config.GITHUB_TOKEN}`,
  },
});

/**
 * Get organization ID by organization login
 */
async function getOrganizationId(orgLogin) {
  const query = `
    query($login: String!) {
      organization(login: $login) {
        id
      }
    }
  `;

  try {
    trackApiCall('GraphQL:organizationId');
    const result = await graphqlWithAuth(query, { login: orgLogin });
    return result.organization.id;
  } catch (error) {
    console.error(`Error fetching organization ID for ${orgLogin}:`, error.message);
    return null;
  }
}

/**
 * Get user contributions for a date range
 * @param {string} username - GitHub username
 * @param {string} from - ISO 8601 date string (start of range)
 * @param {string} to - ISO 8601 date string (end of range)
 * @param {string} orgLogin - Organization login (optional, for filtering)
 * @returns {Object} Contributions data
 */
export async function getUserContributions(username, from, to, orgLogin = null) {
  let organizationID = null;

  // If org is specified, get its ID for filtering
  if (orgLogin) {
    organizationID = await getOrganizationId(orgLogin);
  }

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        login
        name
        avatarUrl
        contributionsCollection(from: $from, to: $to) {
          startedAt
          endedAt
          hasActivityInThePast

          # Total counts
          totalCommitContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          totalIssueContributions
          restrictedContributionsCount

          # Commits by repository
          commitContributionsByRepository(maxRepositories: 100) {
            repository {
              name
              nameWithOwner
              url
              owner {
                login
              }
            }
            contributions(first: 100) {
              totalCount
              nodes {
                occurredAt
                commitCount
              }
            }
          }

          # Pull Requests
          pullRequestContributions(first: 100) {
            totalCount
            nodes {
              occurredAt
              pullRequest {
                id
                number
                title
                url
                state
                isDraft
                createdAt
                mergedAt
                closedAt
                repository {
                  name
                  nameWithOwner
                  url
                  owner {
                    login
                  }
                }
              }
            }
          }

          # Pull Request Reviews
          pullRequestReviewContributions(first: 100) {
            totalCount
            nodes {
              occurredAt
              pullRequest {
                id
                number
                title
                url
                state
                repository {
                  name
                  nameWithOwner
                  url
                  owner {
                    login
                  }
                }
              }
              pullRequestReview {
                id
                state
                createdAt
                submittedAt
              }
            }
          }

          # Issues
          issueContributions(first: 100) {
            totalCount
            nodes {
              occurredAt
              issue {
                id
                number
                title
                url
                state
                createdAt
                closedAt
                repository {
                  name
                  nameWithOwner
                  url
                  owner {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    trackApiCall('GraphQL:userContributions');
    const result = await graphqlWithAuth(query, {
      username,
      from,
      to,
    });

    const collection = result.user.contributionsCollection;

    // Filter by organization if specified
    const filterByOrg = (items) => {
      if (!orgLogin) return items;
      return items.filter(item => {
        const repo = item.pullRequest?.repository || item.issue?.repository;
        return repo && repo.owner.login.toLowerCase() === orgLogin.toLowerCase();
      });
    };

    const filterCommitsByOrg = (repos) => {
      if (!orgLogin) return repos;
      return repos.filter(repo =>
        repo.repository.owner.login.toLowerCase() === orgLogin.toLowerCase()
      );
    };

    return {
      user: {
        login: result.user.login,
        name: result.user.name,
        avatarUrl: result.user.avatarUrl,
      },
      period: {
        from: collection.startedAt,
        to: collection.endedAt,
      },
      summary: {
        totalCommits: collection.totalCommitContributions,
        totalPullRequests: collection.totalPullRequestContributions,
        totalReviews: collection.totalPullRequestReviewContributions,
        totalIssues: collection.totalIssueContributions,
        restrictedContributions: collection.restrictedContributionsCount,
        hasActivity: collection.hasActivityInThePast,
      },
      commits: {
        byRepository: filterCommitsByOrg(collection.commitContributionsByRepository).map(repo => ({
          repository: {
            name: repo.repository.name,
            fullName: repo.repository.nameWithOwner,
            url: repo.repository.url,
            owner: repo.repository.owner.login,
          },
          totalCount: repo.contributions.totalCount,
          contributions: repo.contributions.nodes.map(node => ({
            date: node.occurredAt,
            commitCount: node.commitCount,
          })),
        })),
      },
      pullRequests: filterByOrg(collection.pullRequestContributions.nodes).map(node => ({
        occurredAt: node.occurredAt,
        pullRequest: {
          id: node.pullRequest.id,
          number: node.pullRequest.number,
          title: node.pullRequest.title,
          url: node.pullRequest.url,
          state: node.pullRequest.state,
          isDraft: node.pullRequest.isDraft,
          createdAt: node.pullRequest.createdAt,
          mergedAt: node.pullRequest.mergedAt,
          closedAt: node.pullRequest.closedAt,
          repository: {
            name: node.pullRequest.repository.name,
            fullName: node.pullRequest.repository.nameWithOwner,
            url: node.pullRequest.repository.url,
            owner: node.pullRequest.repository.owner.login,
          },
        },
      })),
      reviews: filterByOrg(collection.pullRequestReviewContributions.nodes).map(node => ({
        occurredAt: node.occurredAt,
        pullRequest: {
          id: node.pullRequest.id,
          number: node.pullRequest.number,
          title: node.pullRequest.title,
          url: node.pullRequest.url,
          state: node.pullRequest.state,
          repository: {
            name: node.pullRequest.repository.name,
            fullName: node.pullRequest.repository.nameWithOwner,
            url: node.pullRequest.repository.url,
            owner: node.pullRequest.repository.owner.login,
          },
        },
        review: {
          id: node.pullRequestReview.id,
          state: node.pullRequestReview.state,
          createdAt: node.pullRequestReview.createdAt,
          submittedAt: node.pullRequestReview.submittedAt,
        },
      })),
      issues: filterByOrg(collection.issueContributions.nodes).map(node => ({
        occurredAt: node.occurredAt,
        issue: {
          id: node.issue.id,
          number: node.issue.number,
          title: node.issue.title,
          url: node.issue.url,
          state: node.issue.state,
          createdAt: node.issue.createdAt,
          closedAt: node.issue.closedAt,
          repository: {
            name: node.issue.repository.name,
            fullName: node.issue.repository.nameWithOwner,
            url: node.issue.repository.url,
            owner: node.issue.repository.owner.login,
          },
        },
      })),
    };
  } catch (error) {
    console.error(`Error fetching contributions for ${username}:`, error.message);
    throw error;
  }
}

/**
 * Get user contributions for the last N days
 */
export async function getUserContributionsLastNDays(username, days = 30, orgLogin = null) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  return getUserContributions(
    username,
    from.toISOString(),
    to.toISOString(),
    orgLogin
  );
}

/**
 * Get user contributions for the current month
 */
export async function getUserContributionsThisMonth(username, orgLogin = null) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  return getUserContributions(
    username,
    from.toISOString(),
    to.toISOString(),
    orgLogin
  );
}

/**
 * Get user contributions for the last month
 */
export async function getUserContributionsLastMonth(username, orgLogin = null) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  return getUserContributions(
    username,
    from.toISOString(),
    to.toISOString(),
    orgLogin
  );
}

/**
 * Efficiently fetch open PRs for multiple users using a single GraphQL query
 * @param {string[]} usernames - Array of GitHub usernames
 * @param {string} orgLogin - Organization login to filter by (optional)
 * @param {number} maxPerUser - Maximum PRs to fetch per user (default: 100)
 * @returns {Object} Map of username -> PRs array
 */
export async function getOpenPRsForUsers(usernames, orgLogin = null, maxPerUser = 100) {
  // GraphQL has query size limits, so batch users if needed
  const BATCH_SIZE = 20; // Process 20 users at a time
  const batches = [];

  for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
    batches.push(usernames.slice(i, i + BATCH_SIZE));
  }

  const allResults = {};

  for (const batch of batches) {
    // Build a GraphQL query with aliases for each user
    const userFragments = batch.map((username, index) => {
      const alias = `user${index}`;
      return `
        ${alias}: user(login: "${username}") {
          login
          name
          avatarUrl
          pullRequests(first: ${maxPerUser}, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
            nodes {
              id
              number
              title
              url
              state
              isDraft
              createdAt
              updatedAt
              mergedAt
              closedAt
              repository {
                name
                nameWithOwner
                url
                owner {
                  login
                }
              }
            }
          }
        }
      `;
    }).join('\n');

    const query = `
      query {
        ${userFragments}
      }
    `;

    try {
      trackApiCall('GraphQL:batchUserPRs');
      const result = await graphqlWithAuth(query);

      // Process results for each user in this batch
      batch.forEach((username, index) => {
        const alias = `user${index}`;
        const userData = result[alias];

        if (!userData) {
          console.warn(`No data returned for user ${username}`);
          allResults[username] = [];
          return;
        }

        let prs = userData.pullRequests.nodes;

        // Filter by organization if specified
        if (orgLogin) {
          prs = prs.filter(pr =>
            pr.repository.owner.login.toLowerCase() === orgLogin.toLowerCase()
          );
        }

        allResults[username] = {
          user: {
            login: userData.login,
            name: userData.name,
            avatarUrl: userData.avatarUrl,
          },
          totalPRs: prs.length,
          pullRequests: prs.map(pr => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            repository: pr.repository.name,
            repositoryFullName: pr.repository.nameWithOwner,
            repositoryUrl: pr.repository.url,
            repositoryOwner: pr.repository.owner.login,
            state: pr.state,
            isDraft: pr.isDraft,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            mergedAt: pr.mergedAt,
            closedAt: pr.closedAt,
          })),
        };
      });
    } catch (error) {
      console.error(`Error fetching PRs for batch:`, error.message);
      // Mark all users in this batch as having errors
      batch.forEach(username => {
        allResults[username] = {
          error: error.message,
          pullRequests: [],
        };
      });
    }
  }

  return allResults;
}

/**
 * Get open PRs for users and group by repository
 * @param {string[]} usernames - Array of GitHub usernames
 * @param {string} orgLogin - Organization login to filter by (optional)
 * @returns {Object} Formatted results with PRs grouped by repo per user
 */
export async function getOpenPRsForUsersGrouped(usernames, orgLogin = null) {
  const results = await getOpenPRsForUsers(usernames, orgLogin);

  // Transform to grouped format
  const grouped = {};

  for (const [username, data] of Object.entries(results)) {
    if (data.error) {
      grouped[username] = data;
      continue;
    }

    // Group PRs by repository
    const byRepo = {};
    for (const pr of data.pullRequests) {
      if (!byRepo[pr.repository]) {
        byRepo[pr.repository] = [];
      }
      byRepo[pr.repository].push(pr);
    }

    grouped[username] = {
      user: data.user,
      totalPRs: data.totalPRs,
      repositories: Object.keys(byRepo).map(repoName => ({
        name: repoName,
        prs: byRepo[repoName],
      })),
    };
  }

  return grouped;
}

/**
 * Efficiently fetch contributions for multiple users using batched GraphQL queries
 * @param {string[]} usernames - Array of GitHub usernames
 * @param {string} from - ISO 8601 date string (start of range)
 * @param {string} to - ISO 8601 date string (end of range)
 * @param {string} orgLogin - Organization login to filter by (optional)
 * @returns {Object} Map of username -> contributions data
 */
export async function getContributionsForUsers(usernames, from, to, orgLogin = null) {
  // Contributions queries are larger, so use smaller batch size
  const BATCH_SIZE = 10;
  const batches = [];

  for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
    batches.push(usernames.slice(i, i + BATCH_SIZE));
  }

  const allResults = {};

  for (const batch of batches) {
    // Build a GraphQL query with aliases for each user
    const userFragments = batch.map((username, index) => {
      const alias = `user${index}`;
      return `
        ${alias}: user(login: "${username}") {
          login
          name
          avatarUrl
          contributionsCollection(from: "${from}", to: "${to}") {
            startedAt
            endedAt
            hasActivityInThePast
            totalCommitContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            totalIssueContributions
            restrictedContributionsCount

            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                name
                nameWithOwner
                url
                owner {
                  login
                }
              }
              contributions(first: 100) {
                totalCount
              }
            }

            pullRequestContributions(first: 100) {
              totalCount
              nodes {
                occurredAt
                pullRequest {
                  id
                  number
                  title
                  url
                  state
                  isDraft
                  createdAt
                  mergedAt
                  closedAt
                  repository {
                    name
                    nameWithOwner
                    url
                    owner {
                      login
                    }
                  }
                }
              }
            }

            pullRequestReviewContributions(first: 100) {
              totalCount
              nodes {
                occurredAt
                pullRequest {
                  id
                  number
                  title
                  url
                  state
                  repository {
                    name
                    nameWithOwner
                    url
                    owner {
                      login
                    }
                  }
                }
                pullRequestReview {
                  id
                  state
                  createdAt
                  submittedAt
                }
              }
            }

            issueContributions(first: 100) {
              totalCount
              nodes {
                occurredAt
                issue {
                  id
                  number
                  title
                  url
                  state
                  createdAt
                  closedAt
                  repository {
                    name
                    nameWithOwner
                    url
                    owner {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      `;
    }).join('\n');

    const query = `
      query {
        ${userFragments}
      }
    `;

    try {
      trackApiCall('GraphQL:batchUserContributions');
      const result = await graphqlWithAuth(query);

      // Process results for each user in this batch
      batch.forEach((username, index) => {
        const alias = `user${index}`;
        const userData = result[alias];

        if (!userData) {
          console.warn(`No data returned for user ${username}`);
          allResults[username] = {
            error: 'User not found',
          };
          return;
        }

        const collection = userData.contributionsCollection;

        // Filter by organization if specified
        const filterByOrg = (items) => {
          if (!orgLogin) return items;
          return items.filter(item => {
            const repo = item.pullRequest?.repository || item.issue?.repository;
            return repo && repo.owner.login.toLowerCase() === orgLogin.toLowerCase();
          });
        };

        const filterCommitsByOrg = (repos) => {
          if (!orgLogin) return repos;
          return repos.filter(repo =>
            repo.repository.owner.login.toLowerCase() === orgLogin.toLowerCase()
          );
        };

        allResults[username] = {
          user: {
            login: userData.login,
            name: userData.name,
            avatarUrl: userData.avatarUrl,
          },
          period: {
            from: collection.startedAt,
            to: collection.endedAt,
          },
          summary: {
            totalCommits: collection.totalCommitContributions,
            totalPullRequests: collection.totalPullRequestContributions,
            totalReviews: collection.totalPullRequestReviewContributions,
            totalIssues: collection.totalIssueContributions,
            restrictedContributions: collection.restrictedContributionsCount,
            hasActivity: collection.hasActivityInThePast,
          },
          commits: {
            byRepository: filterCommitsByOrg(collection.commitContributionsByRepository).map(repo => ({
              repository: {
                name: repo.repository.name,
                fullName: repo.repository.nameWithOwner,
                url: repo.repository.url,
                owner: repo.repository.owner.login,
              },
              totalCount: repo.contributions.totalCount,
            })),
          },
          pullRequests: filterByOrg(collection.pullRequestContributions.nodes).map(node => ({
            occurredAt: node.occurredAt,
            pullRequest: {
              id: node.pullRequest.id,
              number: node.pullRequest.number,
              title: node.pullRequest.title,
              url: node.pullRequest.url,
              state: node.pullRequest.state,
              isDraft: node.pullRequest.isDraft,
              createdAt: node.pullRequest.createdAt,
              mergedAt: node.pullRequest.mergedAt,
              closedAt: node.pullRequest.closedAt,
              repository: {
                name: node.pullRequest.repository.name,
                fullName: node.pullRequest.repository.nameWithOwner,
                url: node.pullRequest.repository.url,
                owner: node.pullRequest.repository.owner.login,
              },
            },
          })),
          reviews: filterByOrg(collection.pullRequestReviewContributions.nodes).map(node => ({
            occurredAt: node.occurredAt,
            pullRequest: {
              id: node.pullRequest.id,
              number: node.pullRequest.number,
              title: node.pullRequest.title,
              url: node.pullRequest.url,
              state: node.pullRequest.state,
              repository: {
                name: node.pullRequest.repository.name,
                fullName: node.pullRequest.repository.nameWithOwner,
                url: node.pullRequest.repository.url,
                owner: node.pullRequest.repository.owner.login,
              },
            },
            review: {
              id: node.pullRequestReview.id,
              state: node.pullRequestReview.state,
              createdAt: node.pullRequestReview.createdAt,
              submittedAt: node.pullRequestReview.submittedAt,
            },
          })),
          issues: filterByOrg(collection.issueContributions.nodes).map(node => ({
            occurredAt: node.occurredAt,
            issue: {
              id: node.issue.id,
              number: node.issue.number,
              title: node.issue.title,
              url: node.issue.url,
              state: node.issue.state,
              createdAt: node.issue.createdAt,
              closedAt: node.issue.closedAt,
              repository: {
                name: node.issue.repository.name,
                fullName: node.issue.repository.nameWithOwner,
                url: node.issue.repository.url,
                owner: node.issue.repository.owner.login,
              },
            },
          })),
        };
      });
    } catch (error) {
      console.error(`Error fetching contributions for batch:`, error.message);
      // Mark all users in this batch as having errors
      batch.forEach(username => {
        allResults[username] = {
          error: error.message,
          user: null,
          summary: null,
        };
      });
    }
  }

  return allResults;
}

/**
 * Get contributions for multiple users in the last N days
 */
export async function getContributionsForUsersLastNDays(usernames, days = 30, orgLogin = null) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  return getContributionsForUsers(
    usernames,
    from.toISOString(),
    to.toISOString(),
    orgLogin
  );
}

/**
 * Get contributions for multiple users in the last month
 */
export async function getContributionsForUsersLastMonth(usernames, orgLogin = null) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  return getContributionsForUsers(
    usernames,
    from.toISOString(),
    to.toISOString(),
    orgLogin
  );
}
