#!/usr/bin/env bash
#
# Dump PostgreSQL and upload the gzipped backup to S3.
#
# Required env:
#   DATABASE_URL        postgres connection string
#   BACKUP_S3_BUCKET    target S3 bucket
# Optional env:
#   BACKUP_S3_PREFIX    key prefix (default: postgres)
#   AWS_REGION          AWS region (default: eu-central-1)
#   BACKUP_RETENTION_DAYS  delete S3 backups older than N days (default: off)
#   DUMP_ONLY=true      write the dump locally to $LOCAL_DUMP_PATH and skip S3
#   LOCAL_DUMP_PATH     path for DUMP_ONLY mode (default: ./backup.sql.gz)
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PREFIX="${BACKUP_S3_PREFIX:-postgres}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="pokemon-auction-${TIMESTAMP}.sql.gz"

if [ "${DUMP_ONLY:-false}" = "true" ]; then
  OUT="${LOCAL_DUMP_PATH:-./backup.sql.gz}"
  echo "Dumping database to ${OUT} ..."
  pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$OUT"
  echo "Wrote $(du -h "$OUT" | cut -f1) to ${OUT}"
  exit 0
fi

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required (or set DUMP_ONLY=true)}"
REGION="${AWS_REGION:-eu-central-1}"
S3_URI="s3://${BACKUP_S3_BUCKET}/${PREFIX}/${FILENAME}"
TMP="$(mktemp -t pgbackup.XXXXXX.sql.gz)"
trap 'rm -f "$TMP"' EXIT

echo "Dumping database ..."
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$TMP"
echo "Dump size: $(du -h "$TMP" | cut -f1)"

echo "Uploading to ${S3_URI} ..."
aws s3 cp "$TMP" "$S3_URI" --region "$REGION"
echo "Backup uploaded: ${S3_URI}"

if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
  echo "Pruning backups older than ${BACKUP_RETENTION_DAYS} days ..."
  CUTOFF="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%s 2>/dev/null \
    || date -u -v-"${BACKUP_RETENTION_DAYS}"d +%s)"
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" --region "$REGION" | while read -r line; do
    file="$(echo "$line" | awk '{print $4}')"
    [ -z "$file" ] && continue
    file_date="$(echo "$file" | sed -E 's/pokemon-auction-([0-9]{8}T[0-9]{6}Z)\.sql\.gz/\1/')"
    file_epoch="$(date -u -d "${file_date:0:8} ${file_date:9:2}:${file_date:11:2}:${file_date:13:2}" +%s 2>/dev/null || echo 0)"
    if [ "$file_epoch" -ne 0 ] && [ "$file_epoch" -lt "$CUTOFF" ]; then
      echo "  deleting $file"
      aws s3 rm "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${file}" --region "$REGION"
    fi
  done
fi

echo "Done."
