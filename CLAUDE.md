# CLAUDE.md — Pokemon Card Auction

Project memory for Claude Code. Read this before making changes. Keep it current
when architecture or conventions change.

## What this is

A Pokémon card auction app:

- **backend/** — Node.js + TypeScript REST API (Express) on **PostgreSQL** + **Redis**, image storage on **S3**. Runs in Docker.
- **mobile/** — Expo React Native app (TypeScript). Talks to the backend over HTTP.

> History: the backend used to run on Cloudflare Workers + D1 (SQLite) + R2.
> That stack was **replaced** by Postgres + Redis + Docker (see `git log`). There
> is no more `wrangler`, D1, or R2. If you see references to them, they are stale.

## Tech stack (decisions — do not silently change)

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------ |
| API runtime    | Node 22, Express 4, TypeScript (ESM, run via `tsx`)          |
| Database       | PostgreSQL 16 (`pg`)                                          |
| Cache          | Redis 7 (`ioredis`) — **optional**; app works without it     |
| Object storage | S3 (`@aws-sdk/client-s3`); `memory` driver for tests/local   |
| Auth           | JWT (`jsonwebtoken`), passwords hashed with `bcryptjs`       |
| Secrets        | AWS SSM Parameter Store, loaded at startup (`USE_SSM=true`)  |
| Packaging      | Docker + `docker-compose.yml` (api + postgres + redis)       |
| Backups        | `pg_dump` → gzip → S3 (`backend/scripts/backup.sh`)          |
| Mobile builds  | Expo EAS (`mobile/eas.json`), token via `EXPO_TOKEN`         |
| CI             | GitHub Actions — every push runs typecheck + tests           |

## Golden rules

1. **Always work with tests.** Every behavior change ships with a test, and
   `npm test` (in `backend/`) must be green before committing. Tests run against
   a real Postgres; CI provides it as a service container.
2. **Redis is an optional cache.** Never make correctness depend on it — code
   must work (just slower) when `REDIS_URL` is unset.
3. **Secrets come from env / SSM**, never hard-coded. Local dev uses
   `backend/.env` (copy from `.env.example`). Production sets `USE_SSM=true` and
   `SSM_PATH=/pokemon-auction/<env>`; the app pulls params into the environment.
4. **Timestamps are unix-second BIGINTs** returned to the client as numbers
   (the mobile app depends on this). See `db.ts` type parser and migrations.
5. **Migrations are forward-only** in `backend/migrations/NNNN_*.sql`, applied by
   `npm run migrate` (also run automatically on container start).

## Backend layout

```
backend/
  src/
    server.ts        bootstrap (SSM hydrate -> config -> app -> listen)
    app.ts           express app factory (createApp(cfg, storage))
    config.ts        env -> typed Config
    ssm.ts           AWS SSM Parameter Store loader
    db.ts            pg pool, query(), withTransaction()
    redis.ts         optional cache helpers (cacheGet/Set/Del)
    storage.ts       Storage interface: S3Storage | MemoryStorage
    lib/             jwt, password
    middleware/      auth (requireAuth/optionalAuth)
    routes/          auth, auctions, images, health
  migrations/        *.sql (forward-only)
  scripts/           migrate.ts, backup.sh, restore.sh
  tests/             vitest + supertest (DB-backed)
```

## Common commands

```bash
# Backend (run from backend/)
npm install
cp .env.example .env
npm run migrate          # apply DB migrations
npm run dev              # hot-reload dev server
npm test                 # vitest (needs Postgres from DATABASE_URL)
npm run typecheck

# Full stack
docker compose up --build        # api :8080, postgres :5432, redis :6379

# Backups
DUMP_ONLY=true LOCAL_DUMP_PATH=./b.sql.gz bash backend/scripts/backup.sh
BACKUP_S3_BUCKET=my-bucket bash backend/scripts/backup.sh
FORCE=true bash backend/scripts/restore.sh s3://my-bucket/postgres/<file>.sql.gz
```

## API surface (unchanged across the migration)

- `POST /auth/register` `{email, username, password}` → `{token, user}`
- `POST /auth/login` `{email, password}` → `{token, user}`
- `GET  /auctions?status=active` → `[{...auction, seller_username}]`
- `GET  /auctions/:id` → `{...auction, bids: [...]}`
- `POST /auctions` (auth) → `{id}`
- `POST /auctions/:id/bid` (auth) `{amount}` → `{message, current_price}`
- `POST /images/upload` (auth, raw binary body) → `{key}`
- `GET  /images/<key>` → image bytes
- `GET  /healthz` (liveness), `GET /readyz` (readiness)

## Deployment

- CI (`.github/workflows/ci.yml`) runs backend typecheck + tests and mobile typecheck.
- `.github/workflows/deploy.yml` builds the backend Docker image, pushes to GHCR,
  then (if AWS secrets are set) runs `aws ssm send-command` to deploy to EC2
  instances tagged `Deploy=<SSM_DEPLOY_TARGET_TAG>`.
- `.github/workflows/eas-build.yml` runs Expo EAS builds (`workflow_dispatch`).

### Required GitHub secrets

- App/deploy: `AWS_ROLE_ARN`, `AWS_REGION`, `SSM_DEPLOY_TARGET_TAG` (optional —
  without them deploy just builds & pushes the image).
- Mobile: `EXPO_TOKEN`.
- App runtime secrets (`DATABASE_URL`, `JWT_SECRET`, `S3_BUCKET`, …) live in AWS
  SSM under `SSM_PATH`, not in GitHub.

See `infra/README.md` for the AWS/SSM/S3 setup details.
