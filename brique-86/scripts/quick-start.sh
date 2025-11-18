#!/bin/bash

# Brique 86 - Quick Start Script
# Sets up local development environment

set -e

echo "🚀 Brique 86 - Quick Start"
echo "=========================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL client not found. Please install PostgreSQL"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm"
    exit 1
fi

echo "✅ Prerequisites OK"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo "✅ Dependencies installed"
echo ""

# Setup environment
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "✅ .env created"
    echo "⚠️  Please edit .env with your database credentials"
    echo ""
else
    echo "✅ .env already exists"
    echo ""
fi

# Load environment
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Database setup
echo "🗄️  Setting up database..."

# Check if database exists
if psql -lqt -h $DB_HOST -U $DB_USER | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "✅ Database $DB_NAME exists"
else
    echo "Creating database $DB_NAME..."
    createdb -h $DB_HOST -U $DB_USER $DB_NAME
    echo "✅ Database created"
fi

# Run migrations
echo "Running migrations..."
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/001_b86_statement_reconciliation.sql

echo "✅ Migrations complete"
echo ""

# Seed test data (optional)
echo "🌱 Seed test data? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Seeding test data..."

    psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Create test bank profile
INSERT INTO bank_profiles (id, name, country, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Bank', 'FR', 'EUR')
ON CONFLICT DO NOTHING;

-- Create test reconciliation config
INSERT INTO reconciliation_config (bank_profile_id, tolerance_pct, tolerance_cents, date_window_days)
VALUES ('00000000-0000-0000-0000-000000000001', 0.005, 100, 2)
ON CONFLICT (bank_profile_id) DO NOTHING;

-- Create test payouts
INSERT INTO payouts (reference_code, provider_ref, amount, currency, status, created_at, updated_at)
VALUES
  ('PO_TEST_001', 'tr_test_001', 1000.00, 'EUR', 'sent', now(), now()),
  ('PO_TEST_002', 'tr_test_002', 2500.00, 'EUR', 'sent', now(), now()),
  ('PO_TEST_003', 'tr_test_003', 500.00, 'EUR', 'sent', now(), now())
ON CONFLICT DO NOTHING;

SELECT 'Seed data inserted: ' || COUNT(*) || ' payouts' FROM payouts WHERE reference_code LIKE 'PO_TEST_%';
EOF

    echo "✅ Test data seeded"
else
    echo "⏭️  Skipping seed data"
fi

echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

echo "✅ Build complete"
echo ""

# Summary
echo "=============================="
echo "✅ Setup Complete!"
echo "=============================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start the API server:"
echo "   npm run dev"
echo ""
echo "2. In another terminal, start the ingestion worker:"
echo "   npm run worker:ingest"
echo ""
echo "3. Access the API:"
echo "   http://localhost:3086"
echo ""
echo "4. View metrics:"
echo "   http://localhost:3086/metrics"
echo ""
echo "5. Run tests:"
echo "   npm test"
echo ""
echo "6. View documentation:"
echo "   cat README.md"
echo "   cat RUNBOOK.md"
echo ""
echo "🎉 Happy reconciling!"
