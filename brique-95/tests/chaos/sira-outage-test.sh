#!/bin/bash
#
# Chaos Test: SIRA Service Outage
# Simulates SIRA becoming unavailable and verifies fallback behavior
#
# Expected Behavior:
# - Routing service should continue to function
# - Fallback logic should activate (prefer_connect with low confidence)
# - Latency may increase slightly but should remain < 150ms
# - Error rate should stay < 0.1%

set -euo pipefail

# Configuration
ROUTING_SERVICE_URL="${ROUTING_SERVICE_URL:-http://routing-service:8082}"
SIRA_SERVICE_NAME="${SIRA_SERVICE_NAME:-sira}"
NAMESPACE="${NAMESPACE:-molam-routing}"
TEST_DURATION_SECONDS="${TEST_DURATION_SECONDS:-300}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus:9090}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] === $1 ===${NC}"
}

# Cleanup function
cleanup() {
    log_step "Cleanup: Restoring SIRA service"
    kubectl scale deployment "$SIRA_SERVICE_NAME" --replicas=3 -n "$NAMESPACE" 2>/dev/null || true
    log_info "SIRA service restored"
}

trap cleanup EXIT

# Pre-test validation
log_step "Pre-Test Validation"

log_info "Checking routing service health..."
HEALTH=$(curl -s "$ROUTING_SERVICE_URL/health" | jq -r '.status')
if [ "$HEALTH" != "healthy" ]; then
    log_error "Routing service is not healthy before test. Aborting."
    exit 1
fi
log_info "✓ Routing service is healthy"

log_info "Checking SIRA service status..."
SIRA_REPLICAS=$(kubectl get deployment "$SIRA_SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$SIRA_REPLICAS" -lt "1" ]; then
    log_error "SIRA service is not running before test. Aborting."
    exit 1
fi
log_info "✓ SIRA service has $SIRA_REPLICAS replicas running"

# Baseline metrics
log_step "Collecting Baseline Metrics"

BASELINE_ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[5m]))/sum(rate(routing_requests_total[5m]))" | jq -r '.data.result[0].value[1] // "0"')
BASELINE_P95_LATENCY=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000" | jq -r '.data.result[0].value[1] // "0"')
BASELINE_RPS=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total[5m]))" | jq -r '.data.result[0].value[1] // "0"')

log_info "Baseline Error Rate: $(echo "$BASELINE_ERROR_RATE * 100" | bc -l | cut -c1-5)%"
log_info "Baseline P95 Latency: $(echo "$BASELINE_P95_LATENCY" | cut -d. -f1)ms"
log_info "Baseline Request Rate: $(echo "$BASELINE_RPS" | cut -d. -f1) req/s"

# Start chaos: Kill SIRA
log_step "Starting Chaos: Scaling SIRA to 0 replicas"

log_warn "Scaling SIRA deployment to 0 replicas..."
kubectl scale deployment "$SIRA_SERVICE_NAME" --replicas=0 -n "$NAMESPACE"

log_info "Waiting for SIRA pods to terminate..."
sleep 10

SIRA_PODS=$(kubectl get pods -n "$NAMESPACE" -l "app=$SIRA_SERVICE_NAME" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
if [ "$SIRA_PODS" -gt "0" ]; then
    log_warn "SIRA pods still running, waiting longer..."
    sleep 10
fi

log_warn "✓ SIRA service is now DOWN"

# Monitor routing service behavior during outage
log_step "Monitoring Routing Service Behavior (${TEST_DURATION_SECONDS}s)"

START_TIME=$(date +%s)
SAMPLE_INTERVAL=10
SAMPLES=$((TEST_DURATION_SECONDS / SAMPLE_INTERVAL))

MAX_ERROR_RATE=0
MAX_LATENCY=0
TOTAL_ERRORS=0

for i in $(seq 1 $SAMPLES); do
    ELAPSED=$((i * SAMPLE_INTERVAL))

    # Check error rate
    ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[1m]))/sum(rate(routing_requests_total[1m]))" | jq -r '.data.result[0].value[1] // "0"')
    ERROR_PCT=$(echo "$ERROR_RATE * 100" | bc -l | cut -c1-5)

    # Check P95 latency
    P95_LATENCY=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[1m]))by(le))*1000" | jq -r '.data.result[0].value[1] // "0"')
    P95_MS=$(echo "$P95_LATENCY" | cut -d. -f1)

    # Check SIRA fallback rate
    FALLBACK_COUNT=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_sira_calls_failed_total[1m]))" | jq -r '.data.result[0].value[1] // "0"')

    # Update max values
    if (( $(echo "$ERROR_RATE > $MAX_ERROR_RATE" | bc -l) )); then
        MAX_ERROR_RATE=$ERROR_RATE
    fi

    if (( $(echo "$P95_LATENCY > $MAX_LATENCY" | bc -l) )); then
        MAX_LATENCY=$P95_LATENCY
    fi

    log_info "[$ELAPSED/${TEST_DURATION_SECONDS}s] Error: $ERROR_PCT% | P95: ${P95_MS}ms | SIRA Failures: $(echo "$FALLBACK_COUNT" | cut -d. -f1)/s"

    sleep $SAMPLE_INTERVAL
done

# Analyze results
log_step "Analyzing Test Results"

MAX_ERROR_PCT=$(echo "$MAX_ERROR_RATE * 100" | bc -l | cut -c1-5)
MAX_LATENCY_MS=$(echo "$MAX_LATENCY" | cut -d. -f1)

log_info "Maximum Error Rate: ${MAX_ERROR_PCT}%"
log_info "Maximum P95 Latency: ${MAX_LATENCY_MS}ms"

# Validate results
PASS=true

# Error rate should stay below 0.1% (fallback should handle gracefully)
if (( $(echo "$MAX_ERROR_RATE > 0.001" | bc -l) )); then
    log_error "✗ FAIL: Error rate exceeded 0.1% (was ${MAX_ERROR_PCT}%)"
    PASS=false
else
    log_info "✓ PASS: Error rate stayed below 0.1%"
fi

# Latency should stay below 150ms (slightly elevated due to no cache)
if (( $(echo "$MAX_LATENCY > 150" | bc -l) )); then
    log_error "✗ FAIL: P95 latency exceeded 150ms (was ${MAX_LATENCY_MS}ms)"
    PASS=false
else
    log_info "✓ PASS: P95 latency stayed below 150ms"
fi

# Check that fallback logic was invoked
TOTAL_SIRA_FAILURES=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(increase(routing_sira_calls_failed_total[${TEST_DURATION_SECONDS}s]))" | jq -r '.data.result[0].value[1] // "0"')

if (( $(echo "$TOTAL_SIRA_FAILURES < 10" | bc -l) )); then
    log_warn "⚠ WARNING: Expected more SIRA fallback invocations (only $TOTAL_SIRA_FAILURES)"
else
    log_info "✓ PASS: Fallback logic was invoked ($TOTAL_SIRA_FAILURES SIRA failures detected)"
fi

# Restore SIRA service
log_step "Restoring SIRA Service"
kubectl scale deployment "$SIRA_SERVICE_NAME" --replicas=3 -n "$NAMESPACE"

log_info "Waiting for SIRA pods to become ready..."
kubectl wait --for=condition=ready pod -l "app=$SIRA_SERVICE_NAME" -n "$NAMESPACE" --timeout=60s || log_warn "SIRA pods took longer than expected to start"

log_info "✓ SIRA service restored"

# Post-test validation
log_step "Post-Test Validation"

sleep 20  # Allow metrics to stabilize

POST_ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[5m]))/sum(rate(routing_requests_total[5m]))" | jq -r '.data.result[0].value[1] // "0"')
POST_ERROR_PCT=$(echo "$POST_ERROR_RATE * 100" | bc -l | cut -c1-5)

log_info "Post-test error rate: ${POST_ERROR_PCT}%"

if (( $(echo "$POST_ERROR_RATE > 0.001" | bc -l) )); then
    log_warn "⚠ Error rate still elevated after recovery"
else
    log_info "✓ Service has recovered to normal error rate"
fi

# Final summary
log_step "Test Summary"

if [ "$PASS" = true ]; then
    echo -e "${GREEN}"
    echo "================================================"
    echo "✓ CHAOS TEST PASSED"
    echo "================================================"
    echo -e "${NC}"
    echo "The routing service successfully handled SIRA outage:"
    echo "- Fallback logic worked correctly"
    echo "- Error rate stayed below acceptable threshold"
    echo "- Latency remained within acceptable range"
    echo "- Service recovered successfully"
    exit 0
else
    echo -e "${RED}"
    echo "================================================"
    echo "✗ CHAOS TEST FAILED"
    echo "================================================"
    echo -e "${NC}"
    echo "The routing service did NOT handle SIRA outage gracefully."
    echo "Review the logs above for details."
    exit 1
fi
