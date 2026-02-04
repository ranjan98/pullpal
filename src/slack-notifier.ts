import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

interface PRNotification {
  number: number;
  title: string;
  url: string;
  author: string;
  owner: string;
  repo: string;
}

interface PRReviewNotification extends PRNotification {
  reviewer: string;
  reviewState: string;
}

interface StalePRNotification extends PRNotification {
  age: string;
  reviewCount: number;
}

/**
 * Get the Slack channel to post notifications
 */
function getSlackChannel(): string {
  return process.env.SLACK_CHANNEL || '#pull-requests';
}

/**
 * Notify about a new PR opened
 */
export async function notifyPROpened(pr: PRNotification): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('Slack notifications disabled (no SLACK_BOT_TOKEN)');
    return;
  }

  try {
    await slack.chat.postMessage({
      channel: getSlackChannel(),
      text: `New PR opened: ${pr.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🆕 New Pull Request',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${pr.url}|#${pr.number}: ${pr.title}>*\n\nOpened by *${pr.author}* in \`${pr.owner}/${pr.repo}\``,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '🔍 Ready for review',
            },
          ],
        },
      ],
    });

    console.log(`Slack notification sent for PR #${pr.number}`);
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
}

/**
 * Notify about a PR review
 */
export async function notifyPRReviewed(pr: PRReviewNotification): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('Slack notifications disabled (no SLACK_BOT_TOKEN)');
    return;
  }

  const emoji = getReviewEmoji(pr.reviewState);
  const reviewText = getReviewText(pr.reviewState);

  try {
    await slack.chat.postMessage({
      channel: getSlackChannel(),
      text: `PR reviewed: ${pr.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *<${pr.url}|#${pr.number}: ${pr.title}>*\n\n*${pr.reviewer}* ${reviewText}`,
          },
        },
      ],
    });

    console.log(`Slack review notification sent for PR #${pr.number}`);
  } catch (error) {
    console.error('Error sending Slack review notification:', error);
  }
}

/**
 * Notify about a merged PR
 */
export async function notifyPRMerged(pr: PRNotification): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('Slack notifications disabled (no SLACK_BOT_TOKEN)');
    return;
  }

  try {
    await slack.chat.postMessage({
      channel: getSlackChannel(),
      text: `PR merged: ${pr.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *<${pr.url}|#${pr.number}: ${pr.title}>* was merged`,
          },
        },
      ],
    });

    console.log(`Slack merge notification sent for PR #${pr.number}`);
  } catch (error) {
    console.error('Error sending Slack merge notification:', error);
  }
}

/**
 * Notify about stale PRs
 */
export async function notifyStalePRs(prs: StalePRNotification[]): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('Slack notifications disabled (no SLACK_BOT_TOKEN)');
    return;
  }

  if (prs.length === 0) {
    return;
  }

  try {
    const prBlocks = prs.map((pr) => ({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `• *<${pr.url}|#${pr.number}: ${pr.title}>*\n  Opened by ${pr.author} • ${pr.age} • ${pr.reviewCount} review${pr.reviewCount !== 1 ? 's' : ''}`,
      },
    }));

    await slack.chat.postMessage({
      channel: getSlackChannel(),
      text: `${prs.length} stale PR${prs.length !== 1 ? 's' : ''} need attention`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⏰ Stale Pull Requests',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `The following PRs have been waiting for review:`,
          },
        },
        ...prBlocks,
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 These PRs need your attention to keep development moving',
            },
          ],
        },
      ],
    });

    console.log(`Slack stale PR notification sent (${prs.length} PRs)`);
  } catch (error) {
    console.error('Error sending Slack stale PR notification:', error);
  }
}

/**
 * Send daily summary of open PRs
 */
export async function sendDailySummary(
  totalPRs: number,
  needingReview: number,
  stalePRs: number,
  avgReviewTime: string
): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log('Slack notifications disabled (no SLACK_BOT_TOKEN)');
    return;
  }

  try {
    await slack.chat.postMessage({
      channel: getSlackChannel(),
      text: 'Daily PR Summary',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 Daily PR Summary',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Open PRs:*\n${totalPRs}`,
            },
            {
              type: 'mrkdwn',
              text: `*Needing Review:*\n${needingReview}`,
            },
            {
              type: 'mrkdwn',
              text: `*Stale PRs:*\n${stalePRs}`,
            },
            {
              type: 'mrkdwn',
              text: `*Avg Review Time:*\n${avgReviewTime}`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📅 ${new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}`,
            },
          ],
        },
      ],
    });

    console.log('Slack daily summary sent');
  } catch (error) {
    console.error('Error sending Slack daily summary:', error);
  }
}

/**
 * Get emoji for review state
 */
function getReviewEmoji(state: string): string {
  switch (state.toLowerCase()) {
    case 'approved':
      return '✅';
    case 'changes_requested':
      return '🔄';
    case 'commented':
      return '💬';
    default:
      return '👀';
  }
}

/**
 * Get text for review state
 */
function getReviewText(state: string): string {
  switch (state.toLowerCase()) {
    case 'approved':
      return 'approved this PR';
    case 'changes_requested':
      return 'requested changes';
    case 'commented':
      return 'commented on this PR';
    default:
      return 'reviewed this PR';
  }
}
