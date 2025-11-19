#!/bin/bash
# ============================================================================
# Brique 121 — Setup Script
# ============================================================================
# Purpose: Initialize development environment for Bank Connectors
# Usage: bash scripts/setup.sh
# ============================================================================

set -e  # Exit on error

echo "🚀 Brique 121 - Bank Connectors Setup"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js is not installed${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm is not installed${NC}"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo -e "${RED}❌ PostgreSQL client is not installed${NC}"; exit 1; }
command -v vault >/dev/null 2>&1 || { echo -e "${YELLOW}⚠️  Vault CLI not found (optional for dev)${NC}"; }

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Check database connection
echo "🔍 Checking database connection..."
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not set, using default${NC}"
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/molam_connect"
fi

psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database connection OK${NC}"
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo "Please check your DATABASE_URL: $DATABASE_URL"
    exit 1
fi
echo ""

# Create database schema
echo "🗄️  Creating database schema..."
psql "$DATABASE_URL" -f database/schema.sql
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database schema created${NC}"
else
    echo -e "${RED}❌ Failed to create schema${NC}"
    exit 1
fi
echo ""

# Setup Vault (dev mode)
if command -v vault &> /dev/null; then
    echo "🔐 Setting up Vault (dev mode)..."

    # Check if Vault is already running
    vault status > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "Starting Vault dev server..."
        vault server -dev > vault-dev.log 2>&1 &
        VAULT_PID=$!
        echo $VAULT_PID > .vault-pid
        sleep 2

        # Get dev token
        export VAULT_ADDR='http://127.0.0.1:8200'
        export VAULT_TOKEN='root'

        echo -e "${GREEN}✅ Vault dev server started (PID: $VAULT_PID)${NC}"
        echo "   VAULT_ADDR=$VAULT_ADDR"
        echo "   VAULT_TOKEN=$VAULT_TOKEN"
    else
        echo -e "${GREEN}✅ Vault already running${NC}"
    fi

    # Create test secrets
    echo "Creating test secrets..."
    vault kv put secret/bank/sandbox/api_key value="test-api-key-123" > /dev/null
    vault kv put secret/bank/sandbox/hmac value="test-hmac-secret-xyz" > /dev/null
    echo -e "${GREEN}✅ Test secrets created${NC}"
else
    echo -e "${YELLOW}⚠️  Vault CLI not found, skipping Vault setup${NC}"
fi
echo ""

# Create .env file if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✅ .env file created${NC}"
    echo -e "${YELLOW}⚠️  Please review and update .env with your settings${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript build successful${NC}"
else
    echo -e "${RED}❌ TypeScript build failed${NC}"
    exit 1
fi
echo ""

# Run health checks
echo "🏥 Running health checks..."
echo "   - Database: $(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM bank_profiles;" | tr -d ' ') bank profiles"
echo "   - Tables: $(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'bank%';" | tr -d ' ') bank_* tables"

if command -v vault &> /dev/null && vault status > /dev/null 2>&1; then
    echo "   - Vault: $(vault kv list secret/bank 2>/dev/null | wc -l | tr -d ' ') secret paths"
fi
echo ""

# Summary
echo "═══════════════════════════════════════"
echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Review and update .env file"
echo "  2. Run tests: npm test"
echo "  3. Start development: npm run dev"
echo "  4. Check documentation: README.md"
echo ""
echo "Useful commands:"
echo "  - npm run build       # Build TypeScript"
echo "  - npm run dev         # Watch mode"
echo "  - npm test            # Run tests"
echo "  - npm run db:reset    # Reset database"
echo ""

if [ -f .vault-pid ]; then
    VAULT_PID=$(cat .vault-pid)
    echo "Vault dev server is running (PID: $VAULT_PID)"
    echo "To stop: kill $VAULT_PID"
    echo ""
fi

echo "Happy coding! 🚀"
