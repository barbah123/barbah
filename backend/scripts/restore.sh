#!/usr/bin/env bash
#
# Restore a PostgreSQL backup produced by backup.sh.
#
# Usage:
#   # restore the latest backup in S3
#   ./restore.sh
#   # restore a specific S3 key
#   ./restore.sh s3://my-bucket/postgres/pokemon-auction-20260101T000000Z.sql.gz
#   # restore a local dump
#   ./restore.sh ./backup.sql.gz
#
# Required env:
#   DATABASE_URL        target postgres connection string
# Optional env (for S3 sources):
#   BACKUP_S3_BUCKET, BACKUP_S3_PREFIX (default: postgres), AWS_REGION
#   FORCE=true          skip the interactive confirmation prompt
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
REGION="${AWS_REGION:-eu-central-1}"
PREFIX="${BACKUP_S3_PREFIX:-postgres}"
SOURCE="${1:-}"
TMP="$(mktemp -t pgrestore.XXXXXX.sql.gz)"
trap 'rm -f "$TMP"' EXIT

resolve_latest() {
  : "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required to find the latest backup}"
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" --region "$REGION" \
    | awk '{print $4}' | grep -E '\.sql\.gz$' | sort | tail -n1
}

if [ -z "$SOURCE" ]; then
  LATEST="$(resolve_latest)"
  [ -z "$LATEST" ] && { echo "No backups found in s3://${BACKUP_S3_BUCKET}/${PREFIX}/"; exit 1; }
  SOURCE="s3://${BACKUP_S3_BUCKET}/${PREFIX}/${LATEST}"
fi

echo "Restoring from: ${SOURCE}"
echo "Into database:  ${DATABASE_URL%%\?*}"
if [ "${FORCE:-false}" != "true" ]; then
  read -r -p "This will overwrite existing data. Continue? [y/N] " reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ] || { echo "Aborted."; exit 1; }
fi

if [[ "$SOURCE" == s3://* ]]; then
  echo "Downloading from S3 ..."
  aws s3 cp "$SOURCE" "$TMP" --region "$REGION"
  DUMP="$TMP"
else
  DUMP="$SOURCE"
fi

echo "Applying dump ..."
gunzip -c "$DUMP" | psql "$DATABASE_URL"
echo "Restore complete."
