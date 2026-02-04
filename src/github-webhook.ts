import crypto from 'crypto';
import { trackPR, updatePRStatus, removePR } from './pr-tracker';
import { notifyPROpened, notifyPRReviewed, notifyPRMerged } from './slack-notifier';

interface WebhookPayload {
  action?: string;
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    user: {
      login: string;
    };
    created_at: string;
    state: string;
    draft: boolean;
  };
  review?: {
    state: string;
    user: {
      login: string;
    };
    submitted_at: string;
  };
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
}

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload: string, signature: string): boolean {
  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    console.warn('WARNING: GITHUB_WEBHOOK_SECRET not set - skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Handle GitHub webhook events
 */
export async function handleWebhook(
  event: string,
  payload: WebhookPayload,
  signature: string
): Promise<void> {
  // Verify signature
  const isValid = verifySignature(JSON.stringify(payload), signature);
  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  console.log(`Received GitHub webhook: ${event} - ${payload.action}`);

  try {
    switch (event) {
      case 'pull_request':
        await handlePullRequestEvent(payload);
        break;

      case 'pull_request_review':
        await handlePullRequestReviewEvent(payload);
        break;

      case 'pull_request_review_comment':
        await handlePullRequestReviewCommentEvent(payload);
        break;

      default:
        console.log(`Unhandled event type: ${event}`);
    }
  } catch (error) {
    console.error(`Error handling webhook event ${event}:`, error);
    throw error;
  }
}

/**
 * Handle pull_request events
 */
async function handlePullRequestEvent(payload: WebhookPayload): Promise<void> {
  const { action, pull_request, repository } = payload;

  if (!pull_request) {
    return;
  }

  const prData = {
    number: pull_request.number,
    title: pull_request.title,
    url: pull_request.html_url,
    author: pull_request.user.login,
    createdAt: new Date(pull_request.created_at),
    owner: repository.owner.login,
    repo: repository.name,
    isDraft: pull_request.draft,
  };

  switch (action) {
    case 'opened':
      if (!pull_request.draft) {
        await trackPR(prData);
        await notifyPROpened(prData);
      }
      break;

    case 'ready_for_review':
      await trackPR(prData);
      await notifyPROpened(prData);
      break;

    case 'closed':
      if (pull_request.state === 'closed') {
        await removePR(pull_request.number);
        // Only notify if merged
        const wasMerged = payload.pull_request?.state === 'closed';
        if (wasMerged) {
          await notifyPRMerged(prData);
        }
      }
      break;

    case 'reopened':
      await trackPR(prData);
      break;

    case 'synchronize':
      // PR was updated with new commits
      await updatePRStatus(pull_request.number, { lastUpdated: new Date() });
      break;

    default:
      console.log(`Unhandled pull_request action: ${action}`);
  }
}

/**
 * Handle pull_request_review events
 */
async function handlePullRequestReviewEvent(payload: WebhookPayload): Promise<void> {
  const { action, pull_request, review, repository } = payload;

  if (!pull_request || !review) {
    return;
  }

  const prData = {
    number: pull_request.number,
    title: pull_request.title,
    url: pull_request.html_url,
    author: pull_request.user.login,
    createdAt: new Date(pull_request.created_at),
    owner: repository.owner.login,
    repo: repository.name,
    isDraft: pull_request.draft,
  };

  if (action === 'submitted') {
    const reviewData = {
      reviewer: review.user.login,
      state: review.state,
      submittedAt: new Date(review.submitted_at),
    };

    await updatePRStatus(pull_request.number, {
      lastReviewedAt: reviewData.submittedAt,
      reviewCount: 1, // This will be incremented in the tracker
    });

    // Notify about the review
    await notifyPRReviewed({
      ...prData,
      reviewer: reviewData.reviewer,
      reviewState: reviewData.state,
    });
  }
}

/**
 * Handle pull_request_review_comment events
 */
async function handlePullRequestReviewCommentEvent(payload: WebhookPayload): Promise<void> {
  const { action, pull_request } = payload;

  if (!pull_request) {
    return;
  }

  if (action === 'created') {
    // Update last activity timestamp
    await updatePRStatus(pull_request.number, {
      lastUpdated: new Date(),
    });
  }
}
