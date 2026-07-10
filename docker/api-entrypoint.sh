#!/bin/sh
# EduM API boot: apply migrations, seed once (seed script is idempotent —
# it skips when the demo school already has users), then start the server.
set -e

echo "Applying database migrations…"
npx prisma migrate deploy

echo "Seeding (idempotent — skipped if data exists)…"
npx ts-node --transpile-only prisma/seed.ts || echo "Seed failed (continuing — check logs)"

echo "Starting EduM API…"
exec node dist/main.js
