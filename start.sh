#!/bin/bash
# ============================================================================
# MOLAM CONNECT - Unix/Linux/Mac Startup Script
# ============================================================================

echo "============================================================"
echo " MOLAM CONNECT - Starting Development Server"
echo "============================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[1/5] Checking Node.js version..."
node --version
echo ""

# Check if PostgreSQL is installed
echo "[2/5] Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "[WARNING] PostgreSQL CLI (psql) not found!"
    echo "If PostgreSQL is installed, make sure psql is in your PATH"
    echo ""
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "[3/5] Installing dependencies..."
    npm install
    echo ""
else
    echo "[3/5] Dependencies already installed"
    echo ""
fi

# Check if database exists
echo "[4/5] Checking database..."
echo "If database doesn't exist, run: npm run db:setup"
echo ""

# Start the server
echo "[5/5] Starting server..."
echo ""
echo "============================================================"
echo " Server will start at: http://localhost:3000"
echo " Dashboard: http://localhost:3000/dashboard"
echo " Health Check: http://localhost:3000/health"
echo "============================================================"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
