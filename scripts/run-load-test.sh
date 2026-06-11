#!/bin/bash
# Run k6 load test via Docker (no local k6 install required).
set -e

cd "$(dirname "$0")/.."
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "==> Resetting demo data..."
curl -sf -X POST "$BASE_URL/admin/reset-flash-sale" || {
  echo "Reset failed. Rebuild API: sudo docker compose up --build -d"
  exit 1
}

echo "==> Running k6 load test (100 concurrent users, 5 items in stock)..."
docker run --rm --network host \
  -v "$(pwd)/load-tests:/scripts" \
  grafana/k6 run -e "BASE_URL=$BASE_URL" /scripts/reserve-concurrent.js
