#!/bin/bash
# End-to-end API test script. Run after: docker compose up --build -d
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

green() { printf '\033[0;32m✓ %s\033[0m\n' "$1"; PASS=$((PASS + 1)); }
red()   { printf '\033[0;31m✗ %s\033[0m\n' "$1"; FAIL=$((FAIL + 1)); }

echo "==> Waiting for API at $BASE_URL ..."
for i in $(seq 1 45); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null)
  HTTP_CODE=${HTTP_CODE:-000}
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
    echo "API responded (attempt $i, HTTP $HTTP_CODE)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    red "API did not respond in time (last HTTP code: $HTTP_CODE)"
    echo ""
    echo "Debug tips:"
    echo "  sudo docker compose ps"
    echo "  sudo docker compose logs api --tail 50"
    exit 1
  fi
  sleep 2
done

echo ""
echo "==> 1. Health check"
HEALTH=$(curl -sf "$BASE_URL/health" || echo '{}')
echo "$HEALTH"
echo "$HEALTH" | grep -q '"database":"healthy"' && green "Database healthy" || red "Database unhealthy"
echo "$HEALTH" | grep -q '"redis":"healthy"' && green "Redis healthy" || red "Redis unhealthy"

echo ""
echo "==> 2. Reset flash sale state"
curl -sf -X POST "$BASE_URL/admin/reset-flash-sale" >/dev/null && green "Flash sale reset" || red "Flash sale reset failed"

echo ""
echo "==> 3. Successful reservation"
RES=$(curl -sf -X POST "$BASE_URL/reserve-item" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: e2e-test-$(date +%s)" \
  -d '{"userId": 1, "itemId": 101, "quantity": 1}')
echo "$RES" | grep -q '"success":true' && green "Reservation created" || red "Reservation failed: $RES"

echo ""
echo "==> 4. Idempotency replay"
KEY="idempotent-key-$(date +%s)"
curl -sf -X POST "$BASE_URL/reserve-item" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"userId": 2, "itemId": 102, "quantity": 1}' >/dev/null
REPLAY=$(curl -s -D - -X POST "$BASE_URL/reserve-item" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"userId": 2, "itemId": 102, "quantity": 1}')
echo "$REPLAY" | grep -qi 'X-Idempotent-Replay: true' && green "Idempotent replay header present" || red "Idempotency replay failed"

echo ""
echo "==> 5. Insufficient stock (expect 409)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/reserve-item" \
  -H "Content-Type: application/json" \
  -d '{"userId": 3, "itemId": 101, "quantity": 999}')
[ "$STATUS" = "409" ] && green "Insufficient stock returns 409" || red "Expected 409, got $STATUS"

echo ""
echo "==> 6. Insufficient balance (expect 402)"
# User 3 wallet=50, item 103 price=6.99, qty=10 => 69.90 required (stock=30 is sufficient)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/reserve-item" \
  -H "Content-Type: application/json" \
  -d '{"userId": 3, "itemId": 103, "quantity": 10}')
[ "$STATUS" = "402" ] && green "Insufficient balance returns 402" || red "Expected 402, got $STATUS"

echo ""
echo "==> 7. Metrics endpoint"
METRICS=$(curl -sf "$BASE_URL/metrics")
echo "$METRICS" | grep -q '"requestsTotal"' && green "Metrics endpoint works" || red "Metrics endpoint failed"

echo ""
echo "=============================="
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
