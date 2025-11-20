#!/bin/bash

###############################################################################
# Brique 118: Cleanup Test Database
# Nettoie les données de test après E2E
###############################################################################

set -e

echo "🧹 Cleaning up test database for Brique 118..."

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-molam_connect_test}"
DB_USER="${DB_USER:-postgres}"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "📊 Connecting to: $DB_NAME on $DB_HOST:$DB_PORT"

# Show counts before cleanup
echo ""
echo "📊 Before cleanup:"
$PSQL -c "SELECT COUNT(*) AS session_count FROM playground_sessions;"
$PSQL -c "SELECT COUNT(*) AS snippet_count FROM playground_snippets;"
$PSQL -c "SELECT COUNT(*) AS audit_count FROM playground_audit_logs;"

# Delete test data in correct order (respecting foreign keys)
$PSQL <<SQL
-- Delete audit logs
DELETE FROM playground_audit_logs
WHERE session_id IN (
  SELECT id FROM playground_sessions
  WHERE user_id = '00000000-0000-0000-0000-000000000001'
);

-- Delete snippets
DELETE FROM playground_snippets
WHERE session_id IN (
  SELECT id FROM playground_sessions
  WHERE user_id = '00000000-0000-0000-0000-000000000001'
);

-- Delete sessions
DELETE FROM playground_sessions
WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Delete test merchant
DELETE FROM merchants
WHERE id = '00000000-0000-0000-0000-000000000002';

-- Delete test user
DELETE FROM users
WHERE id = '00000000-0000-0000-0000-000000000001';

SQL

echo "✅ Test data deleted"

# Show counts after cleanup
echo ""
echo "📊 After cleanup:"
$PSQL -c "SELECT COUNT(*) AS session_count FROM playground_sessions;"
$PSQL -c "SELECT COUNT(*) AS snippet_count FROM playground_snippets;"
$PSQL -c "SELECT COUNT(*) AS audit_count FROM playground_audit_logs;"

# Optional: Clean all test data (sessions created during tests)
if [ "$CLEAN_ALL" = "true" ]; then
  echo ""
  echo "🧹 Deep cleaning: removing ALL test sessions..."

  $PSQL <<SQL
-- Delete all sessions with test share keys
DELETE FROM playground_audit_logs
WHERE session_id IN (
  SELECT id FROM playground_sessions WHERE share_key LIKE 'test_%'
);

DELETE FROM playground_snippets
WHERE session_id IN (
  SELECT id FROM playground_sessions WHERE share_key LIKE 'test_%'
);

DELETE FROM playground_sessions
WHERE share_key LIKE 'test_%';

-- Delete sessions created during tests (last 10 minutes)
DELETE FROM playground_audit_logs
WHERE created_at > NOW() - INTERVAL '10 minutes';

DELETE FROM playground_snippets
WHERE created_at > NOW() - INTERVAL '10 minutes';

DELETE FROM playground_sessions
WHERE created_at > NOW() - INTERVAL '10 minutes';

SQL

  echo "✅ Deep clean completed"
fi

# Vacuum to reclaim space
echo ""
echo "♻️  Vacuuming tables..."
$PSQL -c "VACUUM playground_sessions;"
$PSQL -c "VACUUM playground_snippets;"
$PSQL -c "VACUUM playground_audit_logs;"

echo ""
echo "✅ Test database cleanup complete!"
