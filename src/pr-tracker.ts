import { Octokit } from '@octokit/rest';

interface PRData {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: Date;
  owner: string;
  repo: string;
  isDraft: boolean;
  lastReviewedAt?: Date;
  lastUpdated?: Date;
  reviewCount?: number;
}

interface TrackedPR extends PRData {
  reviewers: string[];
  age: number; // in hours
}

// In-memory storage for tracked PRs
// In production, consider using Redis or a database
const trackedPRs = new Map<number, TrackedPR>();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Add or update a PR in the tracker
 */
export async function trackPR(prData: PRData): Promise<void> {
  const age = Math.floor((Date.now() - prData.createdAt.getTime()) / (1000 * 60 * 60));

  const existing = trackedPRs.get(prData.number);

  trackedPRs.set(prData.number, {
    ...prData,
    reviewers: existing?.reviewers || [],
    age,
    reviewCount: existing?.reviewCount || 0,
  });

  console.log(`Tracking PR #${prData.number}: ${prData.title}`);
}

/**
 * Update PR status
 */
export async function updatePRStatus(
  prNumber: number,
  updates: Partial<TrackedPR>
): Promise<void> {
  const pr = trackedPRs.get(prNumber);
  if (!pr) {
    console.warn(`PR #${prNumber} not found in tracker`);
    return;
  }

  trackedPRs.set(prNumber, {
    ...pr,
    ...updates,
    reviewCount: updates.reviewCount !== undefined
      ? (pr.reviewCount || 0) + updates.reviewCount
      : pr.reviewCount,
  });

  console.log(`Updated PR #${prNumber} status`);
}

/**
 * Remove a PR from tracking (when merged or closed)
 */
export async function removePR(prNumber: number): Promise<void> {
  trackedPRs.delete(prNumber);
  console.log(`Removed PR #${prNumber} from tracking`);
}

/**
 * Get all tracked PRs
 */
export function getTrackedPRs(): TrackedPR[] {
  return Array.from(trackedPRs.values());
}

/**
 * Get stale PRs (older than specified hours without review)
 */
export function getStalePRs(hoursThreshold: number = 24): TrackedPR[] {
  const now = Date.now();
  const threshold = hoursThreshold * 60 * 60 * 1000;

  return Array.from(trackedPRs.values()).filter((pr) => {
    const age = now - pr.createdAt.getTime();
    const hasNoRecentReview = !pr.lastReviewedAt ||
      (now - pr.lastReviewedAt.getTime()) > threshold;

    return age > threshold && hasNoRecentReview;
  });
}

/**
 * Get PRs needing review (awaiting first review)
 */
export function getPRsNeedingReview(): TrackedPR[] {
  return Array.from(trackedPRs.values()).filter((pr) => {
    return !pr.lastReviewedAt || pr.reviewCount === 0;
  });
}

/**
 * Sync tracked PRs with GitHub to ensure accuracy
 */
export async function syncWithGitHub(owner: string, repo: string): Promise<void> {
  try {
    const { data: pullRequests } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    console.log(`Syncing ${pullRequests.length} open PRs from GitHub`);

    // Remove PRs that are no longer open
    const openPRNumbers = new Set(pullRequests.map(pr => pr.number));
    for (const prNumber of trackedPRs.keys()) {
      if (!openPRNumbers.has(prNumber)) {
        trackedPRs.delete(prNumber);
      }
    }

    // Add or update PRs from GitHub
    for (const pr of pullRequests) {
      if (pr.draft) {
        continue; // Skip draft PRs
      }

      // Get reviews for this PR
      const { data: reviews } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });

      const lastReview = reviews.length > 0
        ? reviews[reviews.length - 1]
        : null;

      const prData: PRData = {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user?.login || 'unknown',
        createdAt: new Date(pr.created_at),
        owner,
        repo,
        isDraft: pr.draft,
        lastReviewedAt: lastReview ? new Date(lastReview.submitted_at!) : undefined,
        lastUpdated: new Date(pr.updated_at),
        reviewCount: reviews.length,
      };

      await trackPR(prData);

      // Add reviewers
      const reviewers = reviews.map(r => r.user?.login || 'unknown');
      const pr_tracked = trackedPRs.get(pr.number);
      if (pr_tracked) {
        pr_tracked.reviewers = [...new Set(reviewers)];
      }
    }

    console.log(`Sync complete: ${trackedPRs.size} PRs tracked`);
  } catch (error) {
    console.error('Error syncing with GitHub:', error);
    throw error;
  }
}

/**
 * Get PR age in human-readable format
 */
export function formatPRAge(pr: TrackedPR): string {
  const hours = pr.age;

  if (hours < 1) {
    return 'just opened';
  } else if (hours < 24) {
    return `${hours}h old`;
  } else {
    const days = Math.floor(hours / 24);
    return `${days}d old`;
  }
}
