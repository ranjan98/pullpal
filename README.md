# PullPal

Stop chasing reviewers. Automate PR reminders, track review times, and get your code merged faster.

## The Problem

Your PR has been open for 3 days. No reviews. You've sent a Slack message. Nothing. You @mention someone. Still waiting.

Meanwhile, deployments are delayed, features are blocked, and you're context-switching to other work.

**PullPal fixes this.**

## What It Does

- Automated Slack reminders for stale PRs
- GitHub webhook integration for real-time tracking
- Review time metrics to identify bottlenecks
- Daily/hourly summaries of open PRs
- Customizable rules per repo or team

## Quick Start

```bash
git clone https://github.com/yourusername/pullpal.git
cd pullpal
npm install
cp .env.example .env
npm run build
npm start
```

Visit http://localhost:3000

## Setup

Create `.env` file:

```bash
GITHUB_TOKEN=ghp_your_token
GITHUB_WEBHOOK_SECRET=your_secret
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
PORT=3000
STALE_HOURS=24
```

## License

MIT
