#!/bin/bash
# Verifies project files exist for each assessment requirement.
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

check() {
  if [ -e "$2" ] || grep -q "$3" "$2" 2>/dev/null; then
    printf '  ✓ %s\n' "$1"
    PASS=$((PASS + 1))
  else
    printf '  ✗ %s (missing: %s)\n' "$1" "$2"
    FAIL=$((FAIL + 1))
  fi
}

check_file() {
  if [ -f "$2" ]; then
    printf '  ✓ %s\n' "$1"
    PASS=$((PASS + 1))
  else
    printf '  ✗ %s (%s)\n' "$1" "$2"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Mandatory stack ==="
check_file "Express.js API" "src/app.js"
check_file "PostgreSQL migrations" "src/migrations/20240101000001-create-users.js"
check_file "PgBouncer config" "pgbouncer/pgbouncer.ini"
check_file "Docker Compose" "docker-compose.yml"
check_file "Dockerfile" "Dockerfile"

echo ""
echo "=== Bonus stack ==="
check_file "Redis client" "src/services/redisClient.js"
check_file "Sequelize models" "src/models/index.js"

echo ""
echo "=== Functional API ==="
check_file "POST /reserve-item route" "src/routes/index.js"
grep -q "reserve-item" src/routes/index.js && printf '  ✓ reserve-item handler wired\n' && PASS=$((PASS + 1)) || { printf '  ✗ reserve-item handler\n'; FAIL=$((FAIL + 1)); }
check_file "Reservation service" "src/services/reservationService.js"
grep -q "FOR UPDATE" src/services/reservationService.js && printf '  ✓ SELECT FOR UPDATE concurrency\n' && PASS=$((PASS + 1)) || { printf '  ✗ FOR UPDATE\n'; FAIL=$((FAIL + 1)); }

echo ""
echo "=== Bonus features ==="
check_file "Idempotency service" "src/services/idempotencyService.js"
check_file "GET /metrics" "src/controllers/metricsController.js"
check_file "k6 load test" "load-tests/reserve-concurrent.js"

echo ""
echo "=== Deliverables ==="
check_file "README" "README.md"
check_file "Seed data" "src/seeders/20240101000001-demo-data.js"
check_file "E2E test script" "scripts/test-api.sh"

echo ""
echo "=== Live API (optional) ==="
if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
  printf '  ✓ API reachable at localhost:3000\n'
  PASS=$((PASS + 1))
  bash scripts/test-api.sh
else
  printf '  - API not running (start with: sudo docker compose up -d)\n'
fi

echo ""
echo "File checks: $PASS passed, $FAIL failed"
