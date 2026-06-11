#!/bin/sh
set -e

echo "==> Running migrations..."
npx sequelize-cli db:migrate

echo "==> Seeding database (if needed)..."
npx sequelize-cli db:seed:all || echo "Seed skipped (data may already exist)"

echo "==> Starting API server..."
exec node src/server.js
