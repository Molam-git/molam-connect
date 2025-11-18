#!/bin/bash

# Brique 88 - Startup Script
# Starts all components of the Ledger Adjustments system

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Brique 88 - Ledger Adjustments & Compensation Flows          ║"
echo "║  Starting all services...                                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Copying from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file. Please update with your configuration."
  echo ""
fi

# Check database connection
echo "🔍 Checking database connection..."
psql -h ${DB_HOST:-localhost} -U ${DB_USER:-postgres} -d ${DB_NAME:-molam_connect} -c "SELECT 1" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed. Please check your configuration."
  exit 1
fi
echo ""

# Run migrations
echo "📊 Running database migrations..."
psql -h ${DB_HOST:-localhost} -U ${DB_USER:-postgres} -d ${DB_NAME:-molam_connect} -f migrations/001_b88_ledger_adjustments.sql
echo "✅ Migrations completed"
echo ""

# Install dependencies
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo "✅ Dependencies installed"
  echo ""
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
echo "✅ Build completed"
echo ""

# Start services in background
echo "🚀 Starting services..."

# Start API server
echo "  - Starting API server on port 3088..."
PORT=3088 node dist/index.js > logs/api.log 2>&1 &
API_PID=$!
echo "    PID: $API_PID"

# Wait for API to be ready
sleep 2

# Start adjustments processor worker
echo "  - Starting adjustments processor..."
node dist/workers/adjustments-processor.js > logs/adjustments-worker.log 2>&1 &
ADJ_PID=$!
echo "    PID: $ADJ_PID"

# Start compensations worker
echo "  - Starting compensations worker..."
node dist/services/compensations.js > logs/compensations-worker.log 2>&1 &
COMP_PID=$!
echo "    PID: $COMP_PID"

echo ""
echo "✅ All services started successfully!"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Service Status                                                ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  API Server:              http://localhost:3088                ║"
echo "║  Health Check:            http://localhost:3088/health         ║"
echo "║                                                                ║"
echo "║  Process IDs:                                                  ║"
echo "║  - API Server:            $API_PID                                 ║"
echo "║  - Adjustments Worker:    $ADJ_PID                                 ║"
echo "║  - Compensations Worker:  $COMP_PID                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📝 Logs:"
echo "  - API:            tail -f logs/api.log"
echo "  - Adjustments:    tail -f logs/adjustments-worker.log"
echo "  - Compensations:  tail -f logs/compensations-worker.log"
echo ""
echo "🛑 To stop all services:"
echo "  kill $API_PID $ADJ_PID $COMP_PID"
echo ""

# Save PIDs for later
echo "$API_PID" > .pids
echo "$ADJ_PID" >> .pids
echo "$COMP_PID" >> .pids
