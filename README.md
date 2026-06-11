# budventure_task

**Grocery Delivery — Inventory Reservation API**

Backend assessment project: a flash-sale reservation service that keeps inventory and wallet balances correct under heavy concurrent load.

**Stack:** Node.js · Express.js · Sequelize · PostgreSQL · PgBouncer · Redis · Docker Compose

---

## Table of contents

1. [What this project does](#what-this-project-does)
2. [Quick start (Docker)](#quick-start-docker)
3. [API endpoints](#api-endpoints)
4. [How reservation works](#how-reservation-works)
5. [Concurrency strategy](#concurrency-strategy)
6. [PgBouncer](#pgbouncer)
7. [Database schema](#database-schema)
8. [Bonus features](#bonus-features)
9. [Testing](#testing)
10. [Project structure](#project-structure)
11. [Assumptions and tradeoffs](#assumptions-and-tradeoffs)

---

## What this project does

During a flash sale, many users may try to buy the same low-stock item at once. This API:

- Checks stock and wallet balance
- Reserves inventory and deducts payment in **one atomic transaction**
- Handles race conditions with row-level locking
- Supports **idempotent retries** via `Idempotency-Key`
- Pools DB connections through **PgBouncer**
- Exposes **health** and **metrics** endpoints

---

## Quick start (Docker)

You do **not** need PostgreSQL, Redis, or Node installed locally.

```bash
git clone https://github.com/devgajjar4444/budventure_task.git
cd budventure_task

# If Docker permission error, use: sudo docker compose ...
docker compose up --build -d
```

Wait ~20 seconds, then verify:

```bash
curl http://localhost:3000/health
```

**Example reservation:**

```bash
curl -X POST http://localhost:3000/reserve-item \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-001" \
  -d '{"userId": 1, "itemId": 101, "quantity": 2}'
```

**Success (201):**

```json
{
  "success": true,
  "data": {
    "reservationId": 1,
    "userId": 1,
    "itemId": 101,
    "quantity": 2,
    "totalCost": 9.98,
    "status": "confirmed",
    "remainingStock": 3,
    "remainingBalance": 490.02
  },
  "requestId": "..."
}
```

Run the full automated test suite:

```bash
bash scripts/test-api.sh
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/reserve-item` | Reserve inventory and deduct wallet (main API) |
| `GET` | `/health` | Database + Redis health check |
| `GET` | `/metrics` | Request stats, latency, pool usage, failures |
| `POST` | `/admin/reset-flash-sale` | Reset demo data (for tests / load tests) |

### POST /reserve-item

**Body:**

```json
{
  "userId": 1,
  "itemId": 101,
  "quantity": 2
}
```

**Optional headers:**

| Header | Purpose |
|--------|---------|
| `Idempotency-Key` | Same key on retry returns the same response (no duplicate charge) |
| `X-Request-Id` | Correlation ID for logs (auto-generated if omitted) |

**Error responses:**

| HTTP | Code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Missing or invalid fields |
| 402 | `INSUFFICIENT_BALANCE` | Wallet too low |
| 404 | `USER_NOT_FOUND` / `ITEM_NOT_FOUND` | Invalid user or item |
| 409 | `INSUFFICIENT_STOCK` | Not enough inventory |
| 409 | `IDEMPOTENCY_CONFLICT` | Same idempotency key already processing |
| 504 | `DB_TIMEOUT` | Database query timed out |
| 500 | `TRANSACTION_FAILED` | Unexpected DB error |

---

## How reservation works

```
Client → Express API → PgBouncer → PostgreSQL
              ↓
            Redis (idempotency cache + lock)
```

**Steps inside one database transaction:**

1. Check Redis for existing `Idempotency-Key` response
2. Acquire Redis processing lock (prevents duplicate in-flight requests)
3. `SELECT ... FOR UPDATE` on the **item** row
4. `SELECT ... FOR UPDATE` on the **user** row
5. Validate stock ≥ quantity
6. Validate wallet ≥ price × quantity
7. Decrement stock and wallet
8. Insert reservation record
9. Commit — or rollback everything on any failure
10. Cache response in Redis for future retries

---

## Concurrency strategy

**Approach: pessimistic locking with `SELECT ... FOR UPDATE`**

If 100 users try to buy the last 5 units:

1. Each request opens a transaction and tries to lock the item row.
2. One request holds the lock, reads `stock = 5`, and completes.
3. Others wait, then see updated stock and succeed or get `INSUFFICIENT_STOCK`.
4. Stock never goes negative because check + update happen under the same lock.

**Why not optimistic locking?** Flash sales create heavy contention on one row; pessimistic locking avoids wasted retries.

**Deadlocks:** Item is always locked before user. PostgreSQL deadlock (`40P01`) triggers up to 3 automatic retries with backoff.

---

## PgBouncer

Config: `pgbouncer/pgbouncer.ini`

| Setting | Value | Why |
|---------|-------|-----|
| `pool_mode` | **session** | Sequelize uses prepared statements; session mode is ORM-safe |
| `max_client_conn` | 1000 | Many API clients |
| `default_pool_size` | 20 | Shared PostgreSQL backends |
| `query_timeout` | 10s | Protects against slow queries |

**Why session mode (not transaction mode)?**

- Sequelize + `node-pg` use parameterized queries that break under transaction pooling.
- Session mode still pools connections and prevents connection storms.
- Migrations connect **directly to PostgreSQL** (`DB_MIGRATE_HOST=postgres`), not through PgBouncer.

**Tradeoffs:**

- Session mode holds backend connections longer than transaction mode.
- Startup parameters like `statement_timeout` cannot be sent through PgBouncer (timeouts enforced at PgBouncer level instead).

---

## Database schema

### users

| Column | Type |
|--------|------|
| id | integer (PK) |
| name | varchar |
| wallet_balance | numeric(12,2) |

### items

| Column | Type |
|--------|------|
| id | integer (PK) |
| name | varchar |
| stock | integer |
| price | numeric(12,2) |

### reservations

| Column | Type |
|--------|------|
| id | integer (PK) |
| user_id | integer (FK) |
| item_id | integer (FK) |
| quantity | integer |
| status | varchar |
| idempotency_key | varchar (unique, nullable) |
| created_at | timestamp |

**Seed data (after `npm run seed`):**

| User | Wallet | Item | Stock | Price |
|------|--------|------|-------|-------|
| Alice (1) | $500 | 101 Organic Milk | **5** | $4.99 |
| Bob (2) | $200 | 102 Bread | 100 | $3.49 |
| Charlie (3) | $50 | 103 Eggs | 30 | $6.99 |

Item **101** is the flash-sale item used in load tests.

---

## Bonus features

### Idempotency

```bash
curl -X POST http://localhost:3000/reserve-item \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: abc123" \
  -d '{"userId": 1, "itemId": 102, "quantity": 1}'
```

Retry with the same key → same response, header `X-Idempotent-Replay: true`.

Layers: Redis cache → Redis lock → DB unique constraint on `idempotency_key`.

### Metrics

```bash
curl http://localhost:3000/metrics
```

Returns: request counts, avg/p95/p99 latency, transaction failures, deadlock retries, idempotency hits, DB pool stats, Redis status.

### Structured logging

JSON logs include `requestId`, errors, and (at `LOG_LEVEL=debug`) query timing.

---

## Testing

### Automated API tests

```bash
bash scripts/test-api.sh
```

Covers: health, reset, reservation, idempotency, stock error, balance error, metrics.

### Load test (k6)

Reset demo data, then run 100 concurrent reservations on 5 units of stock:

```bash
curl -X POST http://localhost:3000/admin/reset-flash-sale

# Option A — k6 installed locally
k6 run load-tests/reserve-concurrent.js

# Option B — k6 via Docker (no local install needed)
bash scripts/run-load-test.sh
```

**Expected:** ~5 successes (201), ~95 stock conflicts (409), stock never below 0.

### Verify assessment requirements

```bash
bash scripts/verify-task.sh
```

---

## Project structure

```
budventure_task/
├── docker-compose.yml      # postgres, pgbouncer, redis, api
├── Dockerfile
├── pgbouncer/
│   ├── pgbouncer.ini
│   └── userlist.txt
├── load-tests/
│   └── reserve-concurrent.js
├── scripts/
│   ├── test-api.sh         # E2E tests
│   ├── run-load-test.sh    # k6 via Docker
│   └── start.sh            # migrate + seed + start
└── src/
    ├── server.js
    ├── services/reservationService.js   # core business logic
    ├── models/                          # Sequelize
    ├── migrations/
    └── seeders/
```

---

## Assumptions and tradeoffs

1. One item per reservation request (no multi-item cart).
2. Wallet is charged at reservation time, not on delivery.
3. Reservations are final (`confirmed`); cancellation is out of scope.
4. Redis is required for idempotency.
5. PgBouncer uses **session** pooling for Sequelize compatibility.
6. `/admin/reset-flash-sale` is enabled by default; set `DISABLE_DEMO_RESET=true` to block it in production.
7. Item row is locked before user row to reduce deadlocks.

---

## Local development (without full Docker rebuild)

```bash
cp .env.example .env
docker compose up postgres pgbouncer redis -d
npm install
npm run setup
npm run dev
```

---

## Author

Submitted as part of the Budventure backend assessment task.
