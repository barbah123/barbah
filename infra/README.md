# Infrastructure

Deployment, secrets, and backup setup for the backend.

## Components

- **Docker** — `backend/Dockerfile` builds the API image (Node 22 + pg client + awscli).
- **Local stack** — `docker-compose.yml` (repo root): api + postgres + redis.
- **Prod stack** — `infra/docker-compose.prod.yml`: pulls the image from GHCR,
  runs postgres + redis + a scheduled S3 backup sidecar, and loads secrets from SSM.
- **Secrets** — AWS SSM Parameter Store, seeded with `infra/ssm-seed.sh`.
- **Backups** — `backend/scripts/backup.sh` / `restore.sh` (pg_dump ⇆ S3).

## 1. AWS SSM (secrets / "keys")

The app reads secrets from SSM at startup when `USE_SSM=true`. Every parameter
under `SSM_PATH` (e.g. `/pokemon-auction/prod`) is injected into the environment
(existing env vars win, so in-cluster values like `DATABASE_URL` can override).

Seed the parameters:

```bash
AWS_REGION=eu-central-1 SSM_PATH=/pokemon-auction/prod \
  JWT_SECRET='...' \
  DATABASE_URL='postgres://user:pass@db-host:5432/pokemon_auction' \
  S3_BUCKET='pokemon-auction-images' \
  BACKUP_S3_BUCKET='pokemon-auction-backups' \
  ./infra/ssm-seed.sh
```

The instance/task IAM role needs:

- `ssm:GetParametersByPath` on `arn:aws:ssm:<region>:<acct>:parameter/pokemon-auction/*`
- `kms:Decrypt` on the key used for the SecureStrings
- `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject` on the
  image bucket and backup bucket

## 2. Deploy (GitHub Actions → GHCR → EC2 via SSM)

`.github/workflows/deploy.yml`:

1. Builds `backend/` and pushes `ghcr.io/<owner>/<repo>-backend:<sha>` (+ `:latest`).
2. If `AWS_ROLE_ARN`, `AWS_REGION`, and `SSM_DEPLOY_TARGET_TAG` secrets are set,
   runs `aws ssm send-command` against EC2 instances tagged
   `Deploy=<SSM_DEPLOY_TARGET_TAG>`, which pull the new image and restart compose.

On each target instance, once:

```bash
sudo mkdir -p /opt/pokemon-auction && cd /opt/pokemon-auction
sudo cp /path/to/infra/docker-compose.prod.yml docker-compose.yml
export BACKEND_IMAGE=ghcr.io/<owner>/<repo>-backend:latest
export BACKUP_S3_BUCKET=pokemon-auction-backups
docker compose up -d
```

GitHub → repo Settings → Secrets needed: `AWS_ROLE_ARN`, `AWS_REGION`,
`SSM_DEPLOY_TARGET_TAG` (deploy), `EXPO_TOKEN` (mobile builds). `GITHUB_TOKEN`
(GHCR push) is automatic.

## 3. Backups & restore

Scheduled backups run as the `backup` service in `docker-compose.prod.yml`
(`BACKUP_INTERVAL_SECONDS`, default daily; `BACKUP_RETENTION_DAYS`, default 14).

Manual:

```bash
# one-off backup to S3
BACKUP_S3_BUCKET=pokemon-auction-backups bash backend/scripts/backup.sh

# restore the latest backup
BACKUP_S3_BUCKET=pokemon-auction-backups DATABASE_URL=... \
  bash backend/scripts/restore.sh

# restore a specific dump
DATABASE_URL=... bash backend/scripts/restore.sh \
  s3://pokemon-auction-backups/postgres/pokemon-auction-20260101T000000Z.sql.gz
```

The backup/restore round-trip is covered by `backend/tests/backup.test.ts`.

## 4. Mobile (Expo EAS)

`.github/workflows/eas-build.yml` (manual dispatch) builds with EAS using
`EXPO_TOKEN`. Profiles live in `mobile/eas.json`; set the real `EXPO_PUBLIC_API_URL`
per profile before shipping.
