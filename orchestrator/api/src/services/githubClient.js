const https = require('https');
const logger = require('../utils/logger');
const vault = require('./vault');

const CONTEXT = 'github';

let cachedToken = null;

// In-memory cache: sha -> commit info (persists for process lifetime)
const commitCache = new Map();

// TTL cache for activity data (releases + PRs) — 5 minute expiry
const activityCache = new Map(); // key -> { data, expiry }
const ACTIVITY_TTL = 5 * 60 * 1000;

async function getToken() {
  if (cachedToken) return cachedToken;

  const secrets = await vault.readSecret('secret/data/pw/infra');
  if (!secrets || !secrets.github_token) {
    logger.warn(CONTEXT, 'GitHub token not found in Vault at secret/data/pw/infra (key: github_token)');
    return null;
  }

  cachedToken = secrets.github_token;
  return cachedToken;
}

/**
 * Parse a git SSH or HTTPS URL into owner/repo.
 * e.g. "git@github.com:lukeRWP/Expansions-Management.git" -> "lukeRWP/Expansions-Management"
 */
function parseRepoSlug(repoUrl) {
  if (!repoUrl) return null;
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = repoUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (sshMatch) return sshMatch[1];
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (httpsMatch) return httpsMatch[1];
  return null;
}

async function githubApi(method, apiPath) {
  const token = await getToken();
  if (!token) return null;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'pw-orchestrator',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        } else {
          logger.warn(CONTEXT, `GitHub API ${res.statusCode}: ${apiPath}`);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      logger.error(CONTEXT, `GitHub API error: ${err.message}`);
      resolve(null);
    });
    req.end();
  });
}

/**
 * Get commit details for a SHA.
 * Returns { sha, message, author, date, url, pr } or null.
 */
async function getCommitInfo(repoSlug, sha) {
  if (!repoSlug || !sha) return null;

  // Check cache
  const cacheKey = `${repoSlug}:${sha}`;
  if (commitCache.has(cacheKey)) return commitCache.get(cacheKey);

  const commit = await githubApi('GET', `/repos/${repoSlug}/commits/${sha}`);
  if (!commit) return null;

  const info = {
    sha: commit.sha,
    message: commit.commit?.message?.split('\n')[0] || '',
    author: commit.commit?.author?.name || commit.author?.login || '',
    date: commit.commit?.author?.date || '',
    url: commit.html_url || `https://github.com/${repoSlug}/commit/${sha}`,
    pr: null,
  };

  // Try to get associated PR
  const pulls = await githubApi('GET', `/repos/${repoSlug}/commits/${sha}/pulls`);
  if (pulls && pulls.length > 0) {
    const pr = pulls[0];
    info.pr = {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      branch: pr.head?.ref || '',
      baseBranch: pr.base?.ref || '',
    };
  }

  commitCache.set(cacheKey, info);
  return info;
}

/**
 * Batch fetch commit info for multiple SHAs.
 * Returns { [sha]: commitInfo }.
 */
async function getCommitInfoBatch(repoSlug, shas) {
  const results = {};
  // Run in parallel with concurrency limit of 5
  const chunks = [];
  for (let i = 0; i < shas.length; i += 5) {
    chunks.push(shas.slice(i, i + 5));
  }
  for (const chunk of chunks) {
    const promises = chunk.map(async (sha) => {
      const info = await getCommitInfo(repoSlug, sha);
      if (info) results[sha] = info;
    });
    await Promise.all(promises);
  }
  return results;
}

/**
 * Get recent releases for a repo.
 */
async function getRecentReleases(repoSlug, limit = 5) {
  if (!repoSlug) return [];

  const cacheKey = `releases:${repoSlug}`;
  const cached = activityCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const releases = await githubApi('GET', `/repos/${repoSlug}/releases?per_page=${limit}`);
  if (!releases || !Array.isArray(releases)) return [];

  const data = releases.map((r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    date: r.published_at || r.created_at,
    url: r.html_url,
    author: r.author?.login || '',
    prerelease: r.prerelease || false,
  }));

  activityCache.set(cacheKey, { data, expiry: Date.now() + ACTIVITY_TTL });
  return data;
}

/**
 * Get recently merged PRs for a repo.
 */
async function getRecentPRs(repoSlug, limit = 5) {
  if (!repoSlug) return [];

  const cacheKey = `pulls:${repoSlug}`;
  const cached = activityCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const pulls = await githubApi('GET', `/repos/${repoSlug}/pulls?state=closed&sort=updated&direction=desc&per_page=20`);
  if (!pulls || !Array.isArray(pulls)) return [];

  const data = pulls
    .filter((pr) => pr.merged_at)
    .slice(0, limit)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      branch: pr.head?.ref || '',
      baseBranch: pr.base?.ref || '',
      mergedAt: pr.merged_at,
      author: pr.user?.login || '',
    }));

  activityCache.set(cacheKey, { data, expiry: Date.now() + ACTIVITY_TTL });
  return data;
}

module.exports = { getCommitInfo, getCommitInfoBatch, getRecentReleases, getRecentPRs, parseRepoSlug };
