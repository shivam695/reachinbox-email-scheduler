# ReachInbox Email Scheduler

A production-oriented email scheduling system built for the ReachInbox Software Development Intern assignment. Users log in with Google, compose email campaigns via CSV upload, and the system schedules, rate-limits, and sends them through a BullMQ + Redis job queue — with full restart-safety, idempotency, and real Slack notifications when rate limits are hit.

## Features Implemented

**Backend**
- ✅ TypeScript + Express API
- ✅ PostgreSQL + Prisma ORM
- ✅ BullMQ delayed job scheduling (no cron, no setTimeout)
- ✅ Redis-backed queue, proven restart-safe
- ✅ Idempotent email sending (unique key + atomic DB claim)
- ✅ Configurable worker concurrency
- ✅ Configurable minimum delay between sends
- ✅ Distributed hourly rate limiting (Redis Lua script — atomic across multiple workers)
- ✅ Real Slack OAuth + live rate-limit notifications (with spam prevention)
- ✅ Real Google OAuth login with sessions
- ✅ Elasticsearch indexing + user-scoped search
- ✅ Live BullMQ dashboard (bull-board)
- ✅ Ethereal SMTP email sending

**Frontend**
- ✅ Google login flow
- ✅ Dashboard (user avatar/name/email, logout)
- ✅ Scheduled Emails / Sent Emails tabs (loading + empty states)
- ✅ Compose modal: subject, body, sender, CSV/txt recipient upload with validation
- ✅ Start time, delay, and hourly limit configuration
- ✅ Debounced search bar (Elasticsearch-backed)
- ✅ Slack connect/status UI

## Architecture

User → React Dashboard → POST /api/emails/schedule
↓
PostgreSQL (Campaign + Email records created)
↓
BullMQ delayed jobs (one per recipient)
↓
Redis
↓
Worker picks up job when its time arrives
↓
Check DB: already SENT? → skip (idempotency)
↓
Atomic claim: SCHEDULED → PROCESSING
↓
Redis Lua script: rate limit check
├── Allowed → Ethereal SMTP send → mark SENT → index in Elasticsearch
└── Blocked → reschedule for next hour + Slack notification (deduped)


### How scheduling works
Each recipient in a campaign gets its own row in the `Email` table and its own BullMQ delayed job (`jobId: email-<id>`), delayed until its calculated `scheduledAt` time. BullMQ (backed by Redis) is the single source of truth for *when* a job fires — there is no cron, no polling loop, and no `setInterval`.

### How persistence on restart is handled
BullMQ jobs live in Redis, which persists independently of our Node process. On restart, the worker simply reconnects to the same Redis instance and BullMQ resumes exactly where it left off — no job is lost, recreated, or duplicated. This was manually tested: a job was scheduled, the worker process was killed mid-wait, restarted, and the job still fired at its correct time exactly once.

### How idempotency is enforced
1. Each `Email` row has a **unique** `idempotencyKey` (`campaignId:recipient`) — the database itself physically prevents duplicate scheduling.
2. Before sending, the worker checks if `status === "SENT"` and skips if so.
3. It then performs an **atomic claim**: `UPDATE Email SET status = 'PROCESSING' WHERE id = ? AND status = 'SCHEDULED'`. Only one worker can succeed in this update even if multiple workers race for the same job — the others see `count === 0` and back off.

### How rate limiting is implemented
A Redis **Lua script** performs an atomic "check-and-increment" against a per-sender, per-hour counter key (`email-rate:<sender>:<hour>`). Lua scripts execute as a single atomic unit in Redis, so even with many concurrent workers, the counter can never be over-incremented — this was verified by testing 4 workers/jobs hitting a limit of 2 simultaneously, and confirming exactly 2 sent and 2 correctly deferred.

When blocked, the email is **not failed or dropped** — a new delayed job is created for the top of the next hour, and the database's `scheduledAt` is updated to match.

### How concurrency is configured
`WORKER_CONCURRENCY` (env var) controls how many jobs a single worker processes in parallel, passed directly into BullMQ's `Worker` constructor. Tested with concurrency of 5.

### Slack notifications
On a real Slack OAuth connection (stored per-user in Postgres), a live webhook message is posted the moment an hourly limit is hit. To prevent spamming duplicate alerts when many jobs hit the same limit simultaneously, a Redis key (`slack-rate-limit-notified:<sender>:<hour>`) is set with `NX` (only-if-not-exists) — only the first worker to successfully claim that key sends the notification.

## Tech Stack

- **Backend**: TypeScript, Express, PostgreSQL, Prisma, BullMQ, Redis (ioredis), Elasticsearch, Nodemailer (Ethereal), express-session, googleapis, bull-board
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Router, Axios
- **Infra**: Docker Compose (Postgres, Redis, Elasticsearch)

## Project Structure

reachinbox-email-scheduler/
├── apps/
│ ├── backend/
│ │ ├── prisma/schema.prisma
│ │ └── src/
│ │ ├── db/prisma.ts
│ │ ├── queues/ # BullMQ queue + Redis connection
│ │ ├── workers/ # BullMQ worker (email sending logic)
│ │ ├── services/ # Business logic (scheduling)
│ │ ├── utils/ # Rate limiter (Redis Lua script)
│ │ ├── integrations/
│ │ │ ├── smtp/ # Ethereal provider
│ │ │ ├── slack/ # Slack OAuth + messaging
│ │ │ ├── google/ # Google OAuth
│ │ │ └── elasticsearch/ # Search indexing
│ │ └── server.ts # Express app + all routes
│ └── frontend/
│ └── src/
│ ├── pages/ # Login, Dashboard
│ ├── components/ # EmailTable, ComposeModal
│ ├── context/ # AuthContext
│ └── services/api.ts # Axios instance
├── docker-compose.yml
└── README.md


## Prerequisites

- Node.js v20+
- Docker Desktop
- A Google Cloud project with OAuth credentials
- A Slack app with OAuth credentials

## Environment Variables

Create `apps/backend/.env`:

DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox"

ETHEREAL_HOST=
ETHEREAL_PORT=
ETHEREAL_USER=
ETHEREAL_PASSWORD=

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR=200

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

SESSION_SECRET=some-random-string
FRONTEND_URL=http://localhost:5173


## Setup

### 1. Start infrastructure
```bash
docker compose up -d
```

### 2. Backend
```bash
cd apps/backend
npm install
npx prisma migrate dev
npx ts-node-dev src/server.ts      # API server (terminal 1)
npx ts-node-dev src/workers/emailWorker.ts   # Worker (terminal 2)
```

### 3. Frontend
```bash
cd apps/frontend
npm install
npx vite                            # terminal 3
```

Visit `http://localhost:5173`.

## Google OAuth Setup
1. Create a project at console.cloud.google.com
2. Configure the OAuth consent screen (External, add your email)
3. Create an OAuth Client ID (Web application)
4. Authorized JavaScript origin: `http://localhost:4000`
5. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`

## Slack OAuth Setup
1. Create an app at api.slack.com/apps ("From scratch")
2. Under OAuth & Permissions, add redirect URL: `http://localhost:4000/api/slack/callback`
3. Add Bot Token Scope: `incoming-webhook`
4. Copy Client ID / Secret from Basic Information

## Ethereal Setup
Ethereal test credentials are generated automatically (no account needed) — see `ETHEREAL_*` vars above, generated via `nodemailer.createTestAccount()`.

## Elasticsearch
Runs via Docker Compose on `localhost:9200`, no auth (dev-only config). The `emails` index is created automatically on server startup.

## BullMQ Dashboard
Visit: `http://localhost:4000/admin/queues`

## Restart Test (manual)
1. Schedule an email 30+ seconds in the future
2. Stop the worker process (Ctrl+C)
3. Restart it (`npx ts-node-dev src/workers/emailWorker.ts`)
4. Confirm the email still sends at its correct time, exactly once

This was verified during development — see commit history for the rate-limiting and idempotency implementation.

## Trade-offs & Assumptions

- Ethereal is used exclusively (per assignment spec) — no real email provider integration.
- Elasticsearch and Kibana security features are disabled for local development simplicity; a production deployment would enable auth.
- Session secret and other dev credentials in `.env.example` are placeholders — never committed with real values.
- Toast-style UI notifications were not implemented; the compose modal shows inline error messages instead.
- Automated test coverage focuses on the highest-risk logic (idempotency, rate limiting) rather than full API coverage, given the assignment's time constraints.
- The frontend "Sender" field is free-text rather than a dropdown of verified sender identities, since Ethereal doesn't require sender verification.