#!/bin/bash
# Apply RLS policies to the database
# Usage: ./prisma/apply-rls.sh

set -e
source .env 2>/dev/null || true

DB_URL="${DATABASE_URL:-postgresql://openreal:openreal_dev_2026@localhost:5432/openreal}"

echo "Applying RLS policies..."
psql "$DB_URL" -f prisma/rls-policies.sql
echo "RLS policies applied successfully."
