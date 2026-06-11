#!/bin/bash
# Print container status and recent logs when the API won't start.
cd "$(dirname "$0")/.."

echo "==> Container status"
docker compose ps -a 2>/dev/null || sudo docker compose ps -a

echo ""
echo "==> API logs (last 60 lines)"
docker compose logs api --tail 60 2>/dev/null || sudo docker compose logs api --tail 60

echo ""
echo "==> PgBouncer logs (last 20 lines)"
docker compose logs pgbouncer --tail 20 2>/dev/null || sudo docker compose logs pgbouncer --tail 20

echo ""
echo "==> Health check"
curl -sv http://localhost:3000/health 2>&1 | tail -20
