import { Octokit } from '@octokit/rest';
import { getTrackedPRs, getPRsNeedingReview, getStalePRs } from './pr-tracker';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

interface PRMetrics {
  totalOpenPRs: number;
  needingReview: number;
  stalePRs: number;
  averageReviewTime: string;
  averageMergeTime: string;
  reviewStats: {
    totalReviewed: number;
    totalMerged: number;
    avgReviewsPerPR: number;
  };
  topContributors: Array<{
    author: string;
    openPRs: number;
  }>;
  topReviewers: Array<{
    reviewer: string;
    reviewCount: number;
  }>;
}

/**
 * Calculate time difference in human-readable format
 */
function formatTimeDifference(milliseconds: number): string {
  const hours = milliseconds / (1000 * 60 * 60);

  if (hours < 1) {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    return `${minutes}m`;
  } else if (hours < 24) {
    return `${Math.floor(hours)}h`;
  } else {
    const days = Math.floor(hours / 24);
    if (days === 1) {
      return '1 day';
    }
    return `${days} days`;
  }
}

/**
 * Get comprehensive PR metrics
 */
export async function getPRMetrics(owner: string, repo: string): Promise<PRMetrics> {
  try {
    // Get currently tracked PRs
    const trackedPRs = getTrackedPRs();
    const needingReview = getPRsNeedingReview();
    const stalePRs = getStalePRs(24);

    // Get recently closed PRs for time-to-merge metrics
    const { data: closedPRs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      per_page: 50,
      sort: 'updated',
      direction: 'desc',
    });

    const mergedPRs = closedPRs.filter((pr) => pr.merged_at);

    // Calculate average review time (time to first review)
    let totalReviewTime = 0;
    let reviewedCount = 0;

    for (const pr of mergedPRs.slice(0, 30)) {
      try {
        const { data: reviews } = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });

        if (reviews.length > 0) {
          const firstReview = reviews[0];
          const timeToReview =
            new Date(firstReview.submitted_at!).getTime() -
            new Date(pr.created_at).getTime();

          totalReviewTime += timeToReview;
          reviewedCount++;
        }
      } catch (error) {
        // Skip PRs we can't access
        continue;
      }
    }

    const avgReviewTime =
      reviewedCount > 0
        ? formatTimeDifference(totalReviewTime / reviewedCount)
        : 'N/A';

    // Calculate average merge time
    let totalMergeTime = 0;
    let mergedCount = 0;

    for (const pr of mergedPRs.slice(0, 30)) {
      if (pr.merged_at) {
        const timeToMerge =
          new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime();
        totalMergeTime += timeToMerge;
        mergedCount++;
      }
    }

    const avgMergeTime =
      mergedCount > 0
        ? formatTimeDifference(totalMergeTime / mergedCount)
        : 'N/A';

    // Calculate total reviews
    let totalReviews = 0;
    const reviewerCounts = new Map<string, number>();

    for (const pr of mergedPRs.slice(0, 30)) {
      try {
        const { data: reviews } = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });

        totalReviews += reviews.length;

        for (const review of reviews) {
          const reviewer = review.user?.login || 'unknown';
          reviewerCounts.set(reviewer, (reviewerCounts.get(reviewer) || 0) + 1);
        }
      } catch (error) {
        continue;
      }
    }

    const avgReviewsPerPR = mergedCount > 0 ? totalReviews / mergedCount : 0;

    // Top contributors (by open PRs)
    const contributorCounts = new Map<string, number>();
    for (const pr of trackedPRs) {
      contributorCounts.set(
        pr.author,
        (contributorCounts.get(pr.author) || 0) + 1
      );
    }

    const topContributors = Array.from(contributorCounts.entries())
      .map(([author, openPRs]) => ({ author, openPRs }))
      .sort((a, b) => b.openPRs - a.openPRs)
      .slice(0, 5);

    // Top reviewers (from recent activity)
    const topReviewers = Array.from(reviewerCounts.entries())
      .map(([reviewer, reviewCount]) => ({ reviewer, reviewCount }))
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 5);

    return {
      totalOpenPRs: trackedPRs.length,
      needingReview: needingReview.length,
      stalePRs: stalePRs.length,
      averageReviewTime: avgReviewTime,
      averageMergeTime: avgMergeTime,
      reviewStats: {
        totalReviewed: reviewedCount,
        totalMerged: mergedCount,
        avgReviewsPerPR: Math.round(avgReviewsPerPR * 10) / 10,
      },
      topContributors,
      topReviewers,
    };
  } catch (error) {
    console.error('Error calculating metrics:', error);
    throw error;
  }
}

/**
 * Get metrics for a specific time period
 */
export async function getMetricsForPeriod(
  owner: string,
  repo: string,
  days: number = 7
): Promise<{
  prsOpened: number;
  prsMerged: number;
  prsReviewed: number;
  avgTimeToMerge: string;
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get PRs created in this period
    const { data: allPRs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 100,
      sort: 'created',
      direction: 'desc',
    });

    const periodPRs = allPRs.filter(
      (pr) => new Date(pr.created_at) >= since
    );

    const prsOpened = periodPRs.length;
    const prsMerged = periodPRs.filter((pr) => pr.merged_at).length;

    // Calculate reviewed PRs
    let prsReviewed = 0;
    let totalMergeTime = 0;
    let mergedCount = 0;

    for (const pr of periodPRs) {
      try {
        const { data: reviews } = await octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });

        if (reviews.length > 0) {
          prsReviewed++;
        }

        if (pr.merged_at) {
          const timeToMerge =
            new Date(pr.merged_at).getTime() -
            new Date(pr.created_at).getTime();
          totalMergeTime += timeToMerge;
          mergedCount++;
        }
      } catch (error) {
        continue;
      }
    }

    const avgTimeToMerge =
      mergedCount > 0
        ? formatTimeDifference(totalMergeTime / mergedCount)
        : 'N/A';

    return {
      prsOpened,
      prsMerged,
      prsReviewed,
      avgTimeToMerge,
    };
  } catch (error) {
    console.error('Error calculating period metrics:', error);
    throw error;
  }
}
