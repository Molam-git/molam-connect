#!/bin/bash

###############################################################################
# Brique 118: Seed Test Database for E2E Tests
# Crée des données de test pour le playground
###############################################################################

set -e

echo "🌱 Seeding test database for Brique 118..."

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-molam_connect_test}"
DB_USER="${DB_USER:-postgres}"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "📊 Connecting to: $DB_NAME on $DB_HOST:$DB_PORT"

# Create test user if not exists
$PSQL <<SQL
-- Test user for playground sessions
INSERT INTO users (id, email, role, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'test@molam.com', 'developer', NOW())
ON CONFLICT (id) DO NOTHING;

-- Test merchant
INSERT INTO merchants (id, name, api_key, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'Test Merchant', 'sk_test_e2e_12345', NOW())
ON CONFLICT (id) DO NOTHING;

SQL

echo "✅ Users and merchants seeded"

# Seed playground sessions
$PSQL <<SQL
-- Sample playground sessions
INSERT INTO playground_sessions (id, user_id, request_json, response_json, sira_suggestions, share_key, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '{"method": "POST", "path": "/v1/payments", "body": {"amount": 5000, "currency": "XOF"}}',
    '{"id": "pay_test_123", "status": "succeeded", "amount": 5000}',
    '[{"code": "missing_idempotency", "message": "Ajoutez un header Idempotency-Key"}]',
    'test_share_abc123',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '{"method": "GET", "path": "/v1/payments/pay_123", "headers": {}}',
    '{"id": "pay_123", "status": "succeeded", "amount": 10000}',
    '[]',
    'test_share_xyz789',
    NOW() - INTERVAL '30 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    '{"method": "POST", "path": "/v1/refunds", "body": {"payment_id": "pay_123", "amount": 2500}}',
    '{"id": "ref_test_456", "status": "succeeded", "amount": 2500}',
    '[{"code": "partial_refund", "message": "Remboursement partiel détecté", "severity": "info"}]',
    NULL,
    NOW() - INTERVAL '15 minutes'
  )
ON CONFLICT (id) DO NOTHING;

SQL

echo "✅ Playground sessions seeded"

# Seed code snippets
$PSQL <<SQL
-- Sample code snippets
INSERT INTO playground_snippets (id, session_id, language, snippet_code, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    'node',
    'const molam = new Molam(''sk_test_xxx'');\nconst payment = await molam.payments.create({amount: 5000, currency: ''XOF''});',
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000101',
    'python',
    'import molam\nclient = molam.Client(''sk_test_xxx'')\npayment = client.payments.create({''amount'': 5000, ''currency'': ''XOF''})',
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000102',
    'curl',
    'curl -X GET https://api.molam.com/v1/payments/pay_123 -H "Authorization: Bearer sk_test_xxx"',
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

SQL

echo "✅ Code snippets seeded"

# Seed audit logs
$PSQL <<SQL
-- Audit logs for playground actions
INSERT INTO playground_audit_logs (id, session_id, user_id, action_type, metadata, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'session_run',
    '{"method": "POST", "path": "/v1/payments", "duration_ms": 145}',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'session_save',
    '{"session_id": "00000000-0000-0000-0000-000000000101"}',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'session_share',
    '{"share_key": "test_share_abc123"}',
    NOW() - INTERVAL '55 minutes'
  )
ON CONFLICT (id) DO NOTHING;

SQL

echo "✅ Audit logs seeded"

# Verify seed
echo ""
echo "📈 Seed Summary:"
$PSQL -c "SELECT COUNT(*) AS session_count FROM playground_sessions;"
$PSQL -c "SELECT COUNT(*) AS snippet_count FROM playground_snippets;"
$PSQL -c "SELECT COUNT(*) AS audit_count FROM playground_audit_logs;"

echo ""
echo "✅ Test database seeded successfully!"
echo "🔗 Test share URLs:"
echo "   - http://localhost:8082/playground/test_share_abc123"
echo "   - http://localhost:8082/playground/test_share_xyz789"
