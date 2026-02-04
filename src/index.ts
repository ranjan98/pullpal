import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { handleWebhook } from './github-webhook';
import { startScheduler } from './scheduler';
import { getPRMetrics } from './metrics';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'PullPal',
    status: 'running',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// GitHub webhook endpoint
app.post('/webhooks/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;

  try {
    await handleWebhook(event, req.body, signature);
    res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Metrics endpoint
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return res.status(400).json({ error: 'GITHUB_OWNER and GITHUB_REPO must be configured' });
    }

    const metrics = await getPRMetrics(owner, repo);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Manual trigger for stale PR checks
app.post('/check-stale-prs', async (req: Request, res: Response) => {
  try {
    const { checkStalePRs } = await import('./scheduler');
    await checkStalePRs();
    res.json({ message: 'Stale PR check completed' });
  } catch (error) {
    console.error('Error checking stale PRs:', error);
    res.status(500).json({ error: 'Failed to check stale PRs' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PullPal server running on port ${PORT}`);
  console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`🪝 Webhook endpoint: http://localhost:${PORT}/webhooks/github`);

  // Start the scheduled tasks
  startScheduler();
  console.log('⏰ Scheduler started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
