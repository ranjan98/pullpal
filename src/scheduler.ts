import cron from 'node-cron';
import { syncWithGitHub, getStalePRs, getPRsNeedingReview, getTrackedPRs, formatPRAge } from './pr-tracker';
import { notifyStalePRs, sendDailySummary } from './slack-notifier';
import { getPRMetrics } from './metrics';

/**
 * Check for stale PRs and send notifications
 */
export async function checkStalePRs(): Promise<void> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!owner || !repo) {
    console.error('GITHUB_OWNER and GITHUB_REPO must be configured');
    return;
  }

  try {
    console.log('Running stale PR check...');

    // Sync with GitHub first
    await syncWithGitHub(owner, repo);

    // Get stale PRs (default: 24 hours)
    const staleThreshold = parseInt(process.env.STALE_PR_HOURS || '24', 10);
    const stalePRs = getStalePRs(staleThreshold);

    if (stalePRs.length > 0) {
      console.log(`Found ${stalePRs.length} stale PR(s)`);

      const notifications = stalePRs.map((pr) => ({
        ...pr,
        age: formatPRAge(pr),
        reviewCount: pr.reviewCount || 0,
      }));

      await notifyStalePRs(notifications);
    } else {
      console.log('No stale PRs found');
    }
  } catch (error) {
    console.error('Error checking stale PRs:', error);
  }
}

/**
 * Send daily summary of PR metrics
 */
async function sendDailyMetricsSummary(): Promise<void> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!owner || !repo) {
    console.error('GITHUB_OWNER and GITHUB_REPO must be configured');
    return;
  }

  try {
    console.log('Generating daily metrics summary...');

    await syncWithGitHub(owner, repo);

    const trackedPRs = getTrackedPRs();
    const needingReview = getPRsNeedingReview();
    const stalePRs = getStalePRs(24);
    const metrics = await getPRMetrics(owner, repo);

    await sendDailySummary(
      trackedPRs.length,
      needingReview.length,
      stalePRs.length,
      metrics.averageReviewTime
    );
  } catch (error) {
    console.error('Error sending daily summary:', error);
  }
}

/**
 * Sync with GitHub periodically to keep data fresh
 */
async function periodicSync(): Promise<void> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!owner || !repo) {
    return;
  }

  try {
    console.log('Running periodic GitHub sync...');
    await syncWithGitHub(owner, repo);
  } catch (error) {
    console.error('Error during periodic sync:', error);
  }
}

/**
 * Start all scheduled tasks
 */
export function startScheduler(): void {
  // Check for stale PRs every hour
  cron.schedule(process.env.STALE_CHECK_CRON || '0 * * * *', () => {
    console.log('Triggered: Stale PR check');
    checkStalePRs();
  });

  // Send daily summary at 9 AM
  cron.schedule(process.env.DAILY_SUMMARY_CRON || '0 9 * * *', () => {
    console.log('Triggered: Daily summary');
    sendDailyMetricsSummary();
  });

  // Sync with GitHub every 15 minutes
  cron.schedule(process.env.SYNC_CRON || '*/15 * * * *', () => {
    console.log('Triggered: GitHub sync');
    periodicSync();
  });

  console.log('Scheduled tasks configured:');
  console.log(`  - Stale PR check: ${process.env.STALE_CHECK_CRON || '0 * * * *'} (hourly)`);
  console.log(`  - Daily summary: ${process.env.DAILY_SUMMARY_CRON || '0 9 * * *'} (9 AM)`);
  console.log(`  - GitHub sync: ${process.env.SYNC_CRON || '*/15 * * * *'} (every 15 min)`);

  // Run initial sync
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (owner && repo) {
    console.log('Running initial sync...');
    periodicSync();
  }
}
