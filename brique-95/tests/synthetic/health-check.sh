#!/bin/bash
#
# Synthetic Health Check for Routing Service
# Runs end-to-end routing decision flow to verify service health
#
# Exit codes:
#   0 - Success
#   1 - Health check failed
#   2 - Latency SLO violated
#   3 - Configuration error

set -euo pipefail

# Configuration
ROUTING_SERVICE_URL="${ROUTING_SERVICE_URL:-http://routing-service:8082}"
JWT_TOKEN="${JWT_TOKEN:-}"
MAX_LATENCY_MS="${MAX_LATENCY_MS:-50}"
MERCHANT_ID="${TEST_MERCHANT_ID:-merchant_test}"
USER_ID="${TEST_USER_ID:-user_synthetic_$(date +%s)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
if [ -z "$JWT_TOKEN" ]; then
    log_error "JWT_TOKEN environment variable not set"
    exit 3
fi

# Test 1: Basic health endpoint
log_info "Test 1: Checking /health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$ROUTING_SERVICE_URL/health" || echo "000")
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HEALTH_HTTP_CODE" != "200" ]; then
    log_error "Health check failed with HTTP $HEALTH_HTTP_CODE"
    log_error "Response: $HEALTH_BODY"
    exit 1
fi

# Parse health response
DB_STATUS=$(echo "$HEALTH_BODY" | jq -r '.checks.database // "unknown"')
CACHE_STATUS=$(echo "$HEALTH_BODY" | jq -r '.checks.cache // "unknown"')
SIRA_STATUS=$(echo "$HEALTH_BODY" | jq -r '.checks.sira // "unknown"')

log_info "  Database: $DB_STATUS"
log_info "  Cache: $CACHE_STATUS"
log_info "  SIRA: $SIRA_STATUS"

if [ "$DB_STATUS" != "healthy" ]; then
    log_error "Database is not healthy: $DB_STATUS"
    exit 1
fi

if [ "$CACHE_STATUS" != "healthy" ]; then
    log_warn "Cache is not healthy: $CACHE_STATUS (service can continue in degraded mode)"
fi

log_info "✓ Health check passed"

# Test 2: Routing decision endpoint (small amount, Senegal)
log_info ""
log_info "Test 2: Making routing decision (small amount, Senegal)..."

IDEMPOTENCY_KEY="synthetic_$(date +%s%N)"
START_TIME=$(date +%s%3N)

DECISION_RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
    -X POST "$ROUTING_SERVICE_URL/v1/routing/decide" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"merchant_id\": \"$MERCHANT_ID\",
        \"user_id\": \"$USER_ID\",
        \"amount\": 5000,
        \"currency\": \"XOF\",
        \"country\": \"SN\",
        \"payment_method_hint\": \"any\"
    }" || echo "{}\n000\n0")

DECISION_HTTP_CODE=$(echo "$DECISION_RESPONSE" | tail -n 2 | head -n 1)
DECISION_TIME=$(echo "$DECISION_RESPONSE" | tail -n 1)
DECISION_BODY=$(echo "$DECISION_RESPONSE" | head -n -2)

END_TIME=$(date +%s%3N)
LATENCY_MS=$((END_TIME - START_TIME))

log_info "  HTTP Status: $DECISION_HTTP_CODE"
log_info "  Latency: ${LATENCY_MS}ms"

if [ "$DECISION_HTTP_CODE" != "200" ] && [ "$DECISION_HTTP_CODE" != "201" ]; then
    log_error "Routing decision failed with HTTP $DECISION_HTTP_CODE"
    log_error "Response: $DECISION_BODY"
    exit 1
fi

# Parse decision response
DECISION_ID=$(echo "$DECISION_BODY" | jq -r '.decision_id // .id // "unknown"')
ROUTE=$(echo "$DECISION_BODY" | jq -r '.route // "unknown"')
REASON=$(echo "$DECISION_BODY" | jq -r '.reason // "unknown"')
DECISION_LATENCY=$(echo "$DECISION_BODY" | jq -r '.latency_ms // 0')

log_info "  Decision ID: $DECISION_ID"
log_info "  Route: $ROUTE"
log_info "  Reason: $REASON"
log_info "  Reported Latency: ${DECISION_LATENCY}ms"

if [ "$ROUTE" = "unknown" ] || [ "$ROUTE" = "null" ]; then
    log_error "Invalid routing decision: route is $ROUTE"
    exit 1
fi

# Check latency SLO
if [ "$LATENCY_MS" -gt "$MAX_LATENCY_MS" ]; then
    log_error "Latency SLO violated: ${LATENCY_MS}ms > ${MAX_LATENCY_MS}ms"
    exit 2
fi

log_info "✓ Routing decision successful"

# Test 3: Idempotency check
log_info ""
log_info "Test 3: Testing idempotency..."

IDEMPOTENCY_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$ROUTING_SERVICE_URL/v1/routing/decide" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"merchant_id\": \"$MERCHANT_ID\",
        \"user_id\": \"$USER_ID\",
        \"amount\": 5000,
        \"currency\": \"XOF\",
        \"country\": \"SN\",
        \"payment_method_hint\": \"any\"
    }" || echo "{}\n000")

IDEMPOTENCY_HTTP_CODE=$(echo "$IDEMPOTENCY_RESPONSE" | tail -n 1)
IDEMPOTENCY_BODY=$(echo "$IDEMPOTENCY_RESPONSE" | head -n -1)

if [ "$IDEMPOTENCY_HTTP_CODE" != "200" ] && [ "$IDEMPOTENCY_HTTP_CODE" != "201" ]; then
    log_error "Idempotency check failed with HTTP $IDEMPOTENCY_HTTP_CODE"
    exit 1
fi

IDEMPOTENCY_DECISION_ID=$(echo "$IDEMPOTENCY_BODY" | jq -r '.decision_id // .id // "unknown"')

if [ "$IDEMPOTENCY_DECISION_ID" != "$DECISION_ID" ]; then
    log_error "Idempotency violation: Different decision IDs ($DECISION_ID vs $IDEMPOTENCY_DECISION_ID)"
    exit 1
fi

log_info "  Same decision returned: $IDEMPOTENCY_DECISION_ID"
log_info "✓ Idempotency working correctly"

# Test 4: Retrieve decision by ID
log_info ""
log_info "Test 4: Retrieving decision by ID..."

RETRIEVE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X GET "$ROUTING_SERVICE_URL/v1/routing/decisions/$DECISION_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo "{}\n000")

RETRIEVE_HTTP_CODE=$(echo "$RETRIEVE_RESPONSE" | tail -n 1)
RETRIEVE_BODY=$(echo "$RETRIEVE_RESPONSE" | head -n -1)

if [ "$RETRIEVE_HTTP_CODE" != "200" ]; then
    log_error "Decision retrieval failed with HTTP $RETRIEVE_HTTP_CODE"
    exit 1
fi

RETRIEVED_ROUTE=$(echo "$RETRIEVE_BODY" | jq -r '.decision.route // .route // "unknown"')

if [ "$RETRIEVED_ROUTE" != "$ROUTE" ]; then
    log_error "Retrieved decision mismatch: $RETRIEVED_ROUTE vs $ROUTE"
    exit 1
fi

log_info "  Route confirmed: $RETRIEVED_ROUTE"
log_info "✓ Decision retrieval successful"

# Test 5: High-value transaction (should route to Connect)
log_info ""
log_info "Test 5: Testing high-value transaction routing..."

HIGH_VALUE_KEY="synthetic_high_$(date +%s%N)"

HIGH_VALUE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$ROUTING_SERVICE_URL/v1/routing/decide" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Idempotency-Key: $HIGH_VALUE_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"merchant_id\": \"$MERCHANT_ID\",
        \"user_id\": \"$USER_ID\",
        \"amount\": 1500000,
        \"currency\": \"XOF\",
        \"country\": \"SN\",
        \"payment_method_hint\": \"any\"
    }" || echo "{}\n000")

HIGH_VALUE_HTTP_CODE=$(echo "$HIGH_VALUE_RESPONSE" | tail -n 1)
HIGH_VALUE_BODY=$(echo "$HIGH_VALUE_RESPONSE" | head -n -1)

if [ "$HIGH_VALUE_HTTP_CODE" != "200" ] && [ "$HIGH_VALUE_HTTP_CODE" != "201" ]; then
    log_error "High-value routing failed with HTTP $HIGH_VALUE_HTTP_CODE"
    exit 1
fi

HIGH_VALUE_ROUTE=$(echo "$HIGH_VALUE_BODY" | jq -r '.route // "unknown"')

log_info "  High-value route: $HIGH_VALUE_ROUTE"

# Note: We don't strictly enforce the route here as it depends on business rules
# Just verify that a decision was made
if [ "$HIGH_VALUE_ROUTE" = "unknown" ] || [ "$HIGH_VALUE_ROUTE" = "null" ]; then
    log_error "Invalid high-value routing decision"
    exit 1
fi

log_info "✓ High-value routing successful"

# Summary
log_info ""
log_info "================================================"
log_info "All synthetic checks passed successfully! ✓"
log_info "================================================"
log_info "Total latency: ${LATENCY_MS}ms (limit: ${MAX_LATENCY_MS}ms)"
log_info "Service is healthy and operating within SLO"

exit 0
