#!/bin/bash
# Build, start, and test the full stack.
set -e

cd "$(dirname "$0")/.."

echo "==> Starting Docker Compose..."
docker compose down 2>/dev/null || true
docker compose up --build -d

echo "==> Running API tests..."
bash scripts/test-api.sh

echo ""
echo "All services running. API: http://localhost:3000"
docker compose ps
