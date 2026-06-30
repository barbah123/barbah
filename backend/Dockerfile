# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# postgresql-client provides pg_dump/psql for the backup & restore scripts;
# awscli uploads/downloads backups to S3; curl is used by the healthcheck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client awscli curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

# Apply migrations, then start the API.
CMD ["sh", "-c", "npm run migrate && npm run start"]
