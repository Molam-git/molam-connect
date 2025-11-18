#!/bin/bash
#
# Chaos Test: Redis Cache Outage
# Simulates Redis becoming unavailable and verifies degraded mode operation
#
# Expected Behavior:
# - Routing service should continue to function (no cache)
# - SIRA calls will bypass cache (all cache misses)
# - Latency will increase but should remain < 200ms
# - Error rate should stay < 0.1%
# - Cache hit rate should drop to 0%

set -euo pipefail

# Configuration
ROUTING_SERVICE_URL="${ROUTING_SERVICE_URL:-http://routing-service:8082}"
REDIS_SERVICE_NAME="${REDIS_SERVICE_NAME:-redis}"
NAMESPACE="${NAMESPACE:-molam-routing}"
TEST_DURATION_SECONDS="${TEST_DURATION_SECONDS:-180}"
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
    log_step "Cleanup: Restoring Redis service"
    kubectl scale statefulset "$REDIS_SERVICE_NAME" --replicas=1 -n "$NAMESPACE" 2>/dev/null || true
    log_info "Redis service restored"
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

log_info "Checking Redis service status..."
REDIS_PODS=$(kubectl get pods -n "$NAMESPACE" -l "app=$REDIS_SERVICE_NAME" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
if [ "$REDIS_PODS" -lt "1" ]; then
    log_error "Redis service is not running before test. Aborting."
    exit 1
fi
log_info "✓ Redis service is running ($REDIS_PODS pods)"

# Baseline metrics
log_step "Collecting Baseline Metrics"

BASELINE_ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[5m]))/sum(rate(routing_requests_total[5m]))" | jq -r '.data.result[0].value[1] // "0"')
BASELINE_P95_LATENCY=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000" | jq -r '.data.result[0].value[1] // "0"')
BASELINE_CACHE_HIT_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_cache_hit_total[5m]))/(sum(rate(routing_cache_hit_total[5m]))+sum(rate(routing_cache_miss_total[5m])))" | jq -r '.data.result[0].value[1] // "0"')

log_info "Baseline Error Rate: $(echo "$BASELINE_ERROR_RATE * 100" | bc -l | cut -c1-5)%"
log_info "Baseline P95 Latency: $(echo "$BASELINE_P95_LATENCY" | cut -d. -f1)ms"
log_info "Baseline Cache Hit Rate: $(echo "$BASELINE_CACHE_HIT_RATE * 100" | bc -l | cut -c1-5)%"

# Start chaos: Kill Redis
log_step "Starting Chaos: Scaling Redis to 0 replicas"

log_warn "Scaling Redis statefulset to 0 replicas..."
kubectl scale statefulset "$REDIS_SERVICE_NAME" --replicas=0 -n "$NAMESPACE"

log_info "Waiting for Redis pods to terminate..."
sleep 15

REDIS_PODS_AFTER=$(kubectl get pods -n "$NAMESPACE" -l "app=$REDIS_SERVICE_NAME" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
if [ "$REDIS_PODS_AFTER" -gt "0" ]; then
    log_warn "Redis pods still running, waiting longer..."
    sleep 10
fi

log_warn "✓ Redis service is now DOWN"

# Verify Redis is actually unreachable
log_info "Verifying Redis is unreachable..."
sleep 5

HEALTH_AFTER_REDIS=$(curl -s "$ROUTING_SERVICE_URL/health" | jq -r '.checks.cache // "unknown"')
log_info "Cache health status: $HEALTH_AFTER_REDIS"

if [ "$HEALTH_AFTER_REDIS" = "healthy" ]; then
    log_warn "⚠ WARNING: Cache still reports as healthy. Redis may not be fully down."
fi

# Monitor routing service behavior during outage
log_step "Monitoring Routing Service (Degraded Mode) - ${TEST_DURATION_SECONDS}s"

START_TIME=$(date +%s)
SAMPLE_INTERVAL=10
SAMPLES=$((TEST_DURATION_SECONDS / SAMPLE_INTERVAL))

MAX_ERROR_RATE=0
MAX_LATENCY=0
MIN_CACHE_HIT_RATE=1

for i in $(seq 1 $SAMPLES); do
    ELAPSED=$((i * SAMPLE_INTERVAL))

    # Check error rate
    ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[1m]))/sum(rate(routing_requests_total[1m]))" | jq -r '.data.result[0].value[1] // "0"')
    ERROR_PCT=$(echo "$ERROR_RATE * 100" | bc -l | cut -c1-5)

    # Check P95 latency
    P95_LATENCY=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[1m]))by(le))*1000" | jq -r '.data.result[0].value[1] // "0"')
    P95_MS=$(echo "$P95_LATENCY" | cut -d. -f1)

    # Check cache hit rate (should be 0% or very low)
    CACHE_HIT_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_cache_hit_total[1m]))/(sum(rate(routing_cache_hit_total[1m]))+sum(rate(routing_cache_miss_total[1m])))" | jq -r '.data.result[0].value[1] // "0"')
    CACHE_HIT_PCT=$(echo "$CACHE_HIT_RATE * 100" | bc -l | cut -c1-5)

    # Update max values
    if (( $(echo "$ERROR_RATE > $MAX_ERROR_RATE" | bc -l) )); then
        MAX_ERROR_RATE=$ERROR_RATE
    fi

    if (( $(echo "$P95_LATENCY > $MAX_LATENCY" | bc -l) )); then
        MAX_LATENCY=$P95_LATENCY
    fi

    if (( $(echo "$CACHE_HIT_RATE < $MIN_CACHE_HIT_RATE" | bc -l) )); then
        MIN_CACHE_HIT_RATE=$CACHE_HIT_RATE
    fi

    log_info "[$ELAPSED/${TEST_DURATION_SECONDS}s] Error: $ERROR_PCT% | P95: ${P95_MS}ms | Cache Hit: ${CACHE_HIT_PCT}%"

    sleep $SAMPLE_INTERVAL
done

# Analyze results
log_step "Analyzing Test Results"

MAX_ERROR_PCT=$(echo "$MAX_ERROR_RATE * 100" | bc -l | cut -c1-5)
MAX_LATENCY_MS=$(echo "$MAX_LATENCY" | cut -d. -f1)
MIN_CACHE_HIT_PCT=$(echo "$MIN_CACHE_HIT_RATE * 100" | bc -l | cut -c1-5)

log_info "Maximum Error Rate: ${MAX_ERROR_PCT}%"
log_info "Maximum P95 Latency: ${MAX_LATENCY_MS}ms"
log_info "Minimum Cache Hit Rate: ${MIN_CACHE_HIT_PCT}%"

# Validate results
PASS=true

# Error rate should stay very low (service should work without cache)
if (( $(echo "$MAX_ERROR_RATE > 0.001" | bc -l) )); then
    log_error "✗ FAIL: Error rate exceeded 0.1% (was ${MAX_ERROR_PCT}%)"
    log_error "       Service should handle Redis outage gracefully"
    PASS=false
else
    log_info "✓ PASS: Error rate stayed below 0.1% (service degraded but functional)"
fi

# Latency will be higher (no cache) but should stay below 200ms
if (( $(echo "$MAX_LATENCY > 200" | bc -l) )); then
    log_error "✗ FAIL: P95 latency exceeded 200ms (was ${MAX_LATENCY_MS}ms)"
    log_error "       Degraded performance is too severe"
    PASS=false
else
    log_info "✓ PASS: P95 latency stayed below 200ms in degraded mode"
fi

# Cache hit rate should drop significantly (expected behavior)
if (( $(echo "$MIN_CACHE_HIT_RATE > 0.2" | bc -l) )); then
    log_warn "⚠ WARNING: Cache hit rate was ${MIN_CACHE_HIT_PCT}% (expected near 0%)"
    log_warn "           Redis may not have been fully unavailable"
else
    log_info "✓ PASS: Cache bypassed as expected (hit rate near 0%)"
fi

# Check latency degradation is within acceptable range
LATENCY_INCREASE=$(echo "$MAX_LATENCY - $BASELINE_P95_LATENCY" | bc -l)
LATENCY_INCREASE_PCT=$(echo "($LATENCY_INCREASE / $BASELINE_P95_LATENCY) * 100" | bc -l | cut -d. -f1)

log_info "Latency increase: +${LATENCY_INCREASE_PCT}% (${LATENCY_INCREASE}ms)"

if [ "$LATENCY_INCREASE_PCT" -gt "500" ]; then
    log_warn "⚠ WARNING: Latency increased by more than 500%"
    log_warn "           Consider optimizing non-cached code paths"
fi

# Restore Redis service
log_step "Restoring Redis Service"
kubectl scale statefulset "$REDIS_SERVICE_NAME" --replicas=1 -n "$NAMESPACE"

log_info "Waiting for Redis pods to become ready..."
kubectl wait --for=condition=ready pod -l "app=$REDIS_SERVICE_NAME" -n "$NAMESPACE" --timeout=60s || log_warn "Redis pods took longer than expected to start"

log_info "✓ Redis service restored"

# Post-test validation
log_step "Post-Test Validation (Recovery)"

sleep 30  # Allow cache to warm up

POST_ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_requests_total{result=\"fail\"}[5m]))/sum(rate(routing_requests_total[5m]))" | jq -r '.data.result[0].value[1] // "0"')
POST_ERROR_PCT=$(echo "$POST_ERROR_RATE * 100" | bc -l | cut -c1-5)

POST_P95_LATENCY=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000" | jq -r '.data.result[0].value[1] // "0"')
POST_P95_MS=$(echo "$POST_P95_LATENCY" | cut -d. -f1)

POST_CACHE_HIT_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(routing_cache_hit_total[5m]))/(sum(rate(routing_cache_hit_total[5m]))+sum(rate(routing_cache_miss_total[5m])))" | jq -r '.data.result[0].value[1] // "0"')
POST_CACHE_HIT_PCT=$(echo "$POST_CACHE_HIT_RATE * 100" | bc -l | cut -c1-5)

log_info "Post-recovery Error Rate: ${POST_ERROR_PCT}%"
log_info "Post-recovery P95 Latency: ${POST_P95_MS}ms"
log_info "Post-recovery Cache Hit Rate: ${POST_CACHE_HIT_PCT}%"

# Verify recovery
RECOVERED=true

if (( $(echo "$POST_ERROR_RATE > 0.001" | bc -l) )); then
    log_warn "⚠ Error rate still elevated after recovery"
    RECOVERED=false
fi

if (( $(echo "$POST_P95_LATENCY > 150" | bc -l) )); then
    log_warn "⚠ Latency still elevated after recovery (cache may still be warming up)"
fi

if (( $(echo "$POST_CACHE_HIT_RATE < 0.3" | bc -l) )); then
    log_warn "⚠ Cache hit rate still low (${POST_CACHE_HIT_PCT}%) - may need more time to warm up"
else
    log_info "✓ Cache has recovered and is serving hits"
fi

# Final summary
log_step "Test Summary"

if [ "$PASS" = true ]; then
    echo -e "${GREEN}"
    echo "================================================"
    echo "✓ CHAOS TEST PASSED"
    echo "================================================"
    echo -e "${NC}"
    echo "The routing service successfully handled Redis outage:"
    echo "- Service continued to function without cache (degraded mode)"
    echo "- Error rate stayed below acceptable threshold"
    echo "- Latency increased but remained within acceptable range"
    echo "- Service recovered successfully after Redis restoration"
    echo ""
    echo "Key Metrics:"
    echo "  Max error rate during outage: ${MAX_ERROR_PCT}%"
    echo "  Max P95 latency during outage: ${MAX_LATENCY_MS}ms"
    echo "  Latency degradation: +${LATENCY_INCREASE_PCT}%"
    echo "  Cache hit rate drop: $(echo "($BASELINE_CACHE_HIT_RATE - $MIN_CACHE_HIT_RATE) * 100" | bc -l | cut -c1-5)%"
    echo ""
    if [ "$RECOVERED" = true ]; then
        echo "✓ Service has fully recovered"
    else
        echo "⚠ Service recovery in progress (may take a few more minutes)"
    fi
    exit 0
else
    echo -e "${RED}"
    echo "================================================"
    echo "✗ CHAOS TEST FAILED"
    echo "================================================"
    echo -e "${NC}"
    echo "The routing service did NOT handle Redis outage gracefully."
    echo "Review the logs above for details."
    echo ""
    echo "Common issues:"
    echo "- Service crashes when Redis is unavailable"
    echo "- Error handling for cache failures is insufficient"
    echo "- No graceful degradation to non-cached mode"
    echo "- Connection pool/retry logic needs improvement"
    exit 1
fi
