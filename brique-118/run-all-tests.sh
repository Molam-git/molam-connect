#!/bin/bash

###############################################################################
# Brique 118 + B118bis: Run All Tests Script
# Lance tous les tests E2E et de sécurité
###############################################################################

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Brique 118 + B118bis - Complete Test Suite Runner       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MOCK_SANDBOX_PORT=4001
PLAYGROUND_PORT=8082
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-molam_connect_test}"
DB_USER="${DB_USER:-postgres}"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print section header
print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

# Function to check service is running
wait_for_service() {
    local url=$1
    local name=$2
    local max_wait=30
    local waited=0

    echo -e "${YELLOW}⏳ Waiting for $name...${NC}"

    while ! curl -s "$url" > /dev/null 2>&1; do
        if [ $waited -ge $max_wait ]; then
            echo -e "${RED}❌ $name failed to start within ${max_wait}s${NC}"
            return 1
        fi
        sleep 1
        waited=$((waited + 1))
    done

    echo -e "${GREEN}✅ $name is ready${NC}"
    return 0
}

# Function to run tests and track results
run_test_suite() {
    local name=$1
    local command=$2

    echo -e "${YELLOW}▶ Running: $name${NC}"

    if eval "$command"; then
        echo -e "${GREEN}✅ $name PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ $name FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Parse arguments
RUN_E2E=true
RUN_SECURITY=true
RUN_DOCKER=false
CLEANUP_AFTER=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --e2e-only)
            RUN_SECURITY=false
            shift
            ;;
        --security-only)
            RUN_E2E=false
            shift
            ;;
        --docker)
            RUN_DOCKER=true
            shift
            ;;
        --no-cleanup)
            CLEANUP_AFTER=false
            shift
            ;;
        --help)
            echo "Usage: ./run-all-tests.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --e2e-only        Run only E2E tests"
            echo "  --security-only   Run only security tests"
            echo "  --docker          Run tests in Docker"
            echo "  --no-cleanup      Skip cleanup after tests"
            echo "  --help            Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Docker mode
if [ "$RUN_DOCKER" = true ]; then
    print_section "Running Tests in Docker"

    cd docker
    echo -e "${YELLOW}🐳 Starting Docker Compose...${NC}"

    docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from cypress

    echo -e "${GREEN}✅ Docker tests completed${NC}"

    if [ "$CLEANUP_AFTER" = true ]; then
        echo -e "${YELLOW}🧹 Cleaning up Docker containers...${NC}"
        docker-compose -f docker-compose.test.yml down -v
    fi

    exit 0
fi

# Non-Docker mode - Run tests locally
print_section "Pre-Flight Checks"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  psql not found (tests may fail)${NC}"
else
    echo -e "${GREEN}✅ PostgreSQL client installed${NC}"
fi

# Database setup
print_section "Database Setup"

echo -e "${YELLOW}📊 Running migrations...${NC}"
export PGPASSWORD="${PGPASSWORD:-testpass123}"

for migration in ../brique-117/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "  → $(basename $migration)"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration" > /dev/null 2>&1 || true
    fi
done

echo -e "${GREEN}✅ Migrations completed${NC}"

echo -e "${YELLOW}🌱 Seeding test data...${NC}"
chmod +x test-scripts/seed_test_db.sh
./test-scripts/seed_test_db.sh > /dev/null 2>&1 || true
echo -e "${GREEN}✅ Test data seeded${NC}"

# Start services
print_section "Starting Services"

# Start Mock Sandbox
echo -e "${YELLOW}🚀 Starting Mock Sandbox...${NC}"
cd mock-sandbox
npm start > /tmp/mock-sandbox.log 2>&1 &
MOCK_PID=$!
cd ..

wait_for_service "http://localhost:$MOCK_SANDBOX_PORT/healthz" "Mock Sandbox"

# E2E Tests
if [ "$RUN_E2E" = true ]; then
    print_section "E2E Tests (Cypress & Jest)"

    # Unit tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "Jest Unit Tests" "cd tests/jest && npm test -- sandbox.test.ts --silent"

    # Cypress tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "Cypress E2E Tests" "npx cypress run --headless"
fi

# Security Tests
if [ "$RUN_SECURITY" = true ]; then
    print_section "Security Tests (Hardened)"

    cd tests/jest

    # RBAC tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "RBAC Tests" "npm run test:rbac -- --silent"

    # Share expiry tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "Share Expiry Tests" "npm run test:share-expiry -- --silent"

    # Fuzzing tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "Fuzzing & Injection Tests" "npm run test:fuzzing -- --silent"

    # Rate limiting tests
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    run_test_suite "Rate Limiting Tests" "npm run test:rate-limit -- --silent"

    cd ../..
fi

# Cleanup
print_section "Cleanup"

echo -e "${YELLOW}🛑 Stopping services...${NC}"
kill $MOCK_PID 2>/dev/null || true
echo -e "${GREEN}✅ Services stopped${NC}"

if [ "$CLEANUP_AFTER" = true ]; then
    echo -e "${YELLOW}🧹 Cleaning up test data...${NC}"
    chmod +x test-scripts/cleanup_test_db.sh
    ./test-scripts/cleanup_test_db.sh > /dev/null 2>&1 || true
    echo -e "${GREEN}✅ Cleanup completed${NC}"
fi

# Summary
print_section "Test Summary"

echo -e "Total test suites: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ All tests passed! Production ready! 🚀                ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ Some tests failed. Please review logs above.          ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
