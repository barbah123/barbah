#!/usr/bin/env bash
#
# Seed application secrets into AWS SSM Parameter Store under a path prefix.
# The app loads everything under SSM_PATH at startup when USE_SSM=true.
#
# Usage:
#   AWS_REGION=eu-central-1 SSM_PATH=/pokemon-auction/prod \
#     JWT_SECRET=... DATABASE_URL=... S3_BUCKET=... ./ssm-seed.sh
#
# Each KEY below is written as <SSM_PATH>/KEY as a SecureString.
set -euo pipefail

REGION="${AWS_REGION:-eu-central-1}"
SSM_PATH="${SSM_PATH:-/pokemon-auction/prod}"
PREFIX="${SSM_PATH%/}"

# Add/remove keys as needed.
KEYS=(JWT_SECRET DATABASE_URL REDIS_URL S3_BUCKET AWS_REGION BACKUP_S3_BUCKET)

put() {
  local key="$1" value="$2"
  [ -z "$value" ] && { echo "skip ${key} (empty)"; return; }
  aws ssm put-parameter \
    --region "$REGION" \
    --name "${PREFIX}/${key}" \
    --type SecureString \
    --value "$value" \
    --overwrite >/dev/null
  echo "put ${PREFIX}/${key}"
}

for key in "${KEYS[@]}"; do
  put "$key" "${!key:-}"
done

echo "Done. Verify with:"
echo "  aws ssm get-parameters-by-path --path ${PREFIX} --recursive --with-decryption --region ${REGION}"
