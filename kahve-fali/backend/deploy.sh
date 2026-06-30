#!/usr/bin/env bash
# Kahve Falı backend'ini Cloudflare'a dağıtır.
#
# Gereksinim: CLOUDFLARE_API_TOKEN ortam değişkeni (D1 + Workers düzenleme yetkili).
#   export CLOUDFLARE_API_TOKEN=...
#   ./deploy.sh
#
# Bu script idempotent olacak şekilde yazılmıştır; tekrar çalıştırılabilir.
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "HATA: CLOUDFLARE_API_TOKEN tanımlı değil." >&2
  exit 1
fi

DB_NAME="kahve-fali-db"

echo "==> 1/5 Bağımlılıklar"
npm install --silent

echo "==> 2/5 D1 veritabanı (yoksa oluştur)"
if ! npx wrangler d1 info "$DB_NAME" >/dev/null 2>&1; then
  npx wrangler d1 create "$DB_NAME"
fi
# database_id'yi wrangler.toml'a yaz (placeholder ise)
DB_ID="$(npx wrangler d1 info "$DB_NAME" --json 2>/dev/null | grep -oE '"uuid"\s*:\s*"[^"]+"' | head -1 | grep -oE '[0-9a-f-]{36}')"
if [ -n "${DB_ID:-}" ]; then
  sed -i.bak -E "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml && rm -f wrangler.toml.bak
  echo "    database_id = $DB_ID"
fi

echo "==> 3/5 Şema (migration)"
npx wrangler d1 execute "$DB_NAME" --remote --file=./migrations/0001_init.sql

echo "==> 4/5 Secret'lar (JWT_SECRET, ENCRYPTION_KEY)"
# Var olan secret'ları korumak için yalnızca tanımlı değilse üretip ekleyin.
# Aşağıdaki değerleri kendiniz de 'wrangler secret put' ile girebilirsiniz.
if [ -n "${JWT_SECRET:-}" ]; then
  printf '%s' "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
fi
if [ -n "${ENCRYPTION_KEY:-}" ]; then
  printf '%s' "$ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY
fi

echo "==> 5/5 Deploy"
npx wrangler deploy

echo "Tamamlandı. API: https://kahve-fali-api.<subdomain>.workers.dev"
