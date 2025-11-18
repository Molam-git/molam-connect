# Molam Python SDK - Operations Runbook

**Version**: 0.1.0
**Last Updated**: 2025-01-16
**Owner**: Molam DevOps Team

---

## Table of Contents

1. [Overview](#overview)
2. [Deployment Process](#deployment-process)
3. [Smoke Tests](#smoke-tests)
4. [Rollback Procedures](#rollback-procedures)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Troubleshooting](#troubleshooting)
7. [Incident Response](#incident-response)

---

## Overview

This runbook provides operational procedures for deploying, monitoring, and maintaining the Molam Python SDK in production environments.

### Architecture

- **SDK Type**: Python library (sync + async)
- **Distribution**: Internal PyPI (Artifactory/Nexus)
- **Deployment**: pip install from internal registry
- **Dependencies**: requests, pydantic, aiohttp, pybreaker, prometheus-client

### Environments

| Environment | Purpose | API Endpoint |
|-------------|---------|--------------|
| Sandbox | Development & Testing | https://sandbox.api.molam.io |
| Staging | Pre-production validation | https://staging.api.molam.io |
| Production | Live merchant traffic | https://api.molam.io |

---

## Deployment Process

### Prerequisites

1. **Access & Permissions**
   - GitHub repository write access
   - Internal PyPI publish credentials
   - Sandbox API key for testing

2. **Environment Variables**
   ```bash
   export TWINE_REPO_URL="https://pypi.internal.molam.io"
   export TWINE_USERNAME="__token__"
   export TWINE_PASSWORD="<your-token>"
   export MOLAM_SANDBOX_KEY="<sandbox-key>"
   ```

### Step 1: Pre-Deployment Validation

```bash
# Clone repository
git clone https://github.com/molam/python-sdk.git
cd python-sdk

# Install dependencies
poetry install

# Run full test suite
poetry run pytest tests/ -v --cov=molam_sdk

# Run linters
poetry run black --check .
poetry run mypy molam_sdk
poetry run bandit -r molam_sdk
```

**Success Criteria:**
- ✅ All tests passing (20/20)
- ✅ Code coverage ≥ 80%
- ✅ No linter errors
- ✅ No security vulnerabilities

### Step 2: Build Package

```bash
# Build wheel and source distribution
poetry build

# Verify artifacts
ls -lh dist/
# Expected:
# molam_python_sdk-0.1.0-py3-none-any.whl
# molam-python-sdk-0.1.0.tar.gz
```

### Step 3: Publish to Staging PyPI

```bash
# Publish to internal staging repository
TWINE_REPO_URL="https://pypi-staging.internal.molam.io" \
./ci/publish_internal.sh
```

**Verification:**
```bash
# Verify package is available
pip search --index-url https://pypi-staging.internal.molam.io molam-python-sdk
```

### Step 4: Deploy to Staging Consumer

Deploy SDK to a staging application:

```bash
# In staging application
pip install --index-url https://pypi-staging.internal.molam.io molam-python-sdk==0.1.0
```

### Step 5: Run Integration Smoke Tests

```bash
# Run integration tests against staging
MOLAM_SANDBOX_KEY="$STAGING_KEY" \
pytest tests/integration/ -v
```

**Success Criteria:**
- ✅ Payment intent creation succeeds
- ✅ Payment confirmation succeeds
- ✅ Idempotency works correctly
- ✅ Circuit breaker doesn't trip
- ✅ Metrics are recorded

### Step 6: Tag Release

```bash
# Create release tag
git tag -a v0.1.0 -m "Release v0.1.0 - Industrial Python SDK"
git push origin v0.1.0
```

**CI will automatically:**
- Run full test suite
- Build package
- Publish to production PyPI (if tests pass)

### Step 7: Production Deployment

```bash
# Deploy to production consumers
pip install --index-url https://pypi.internal.molam.io molam-python-sdk==0.1.0
```

### Step 8: Post-Deployment Validation

1. **Monitor Metrics**
   - Check Prometheus dashboard
   - Verify request counts increasing
   - Check circuit breaker state (should be CLOSED)

2. **Check Logs**
   ```bash
   # Verify structured logging
   tail -f /var/log/app/molam-sdk.log | jq
   ```

3. **Smoke Test in Production**
   ```python
   from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate

   config = ClientConfig(api_key="sk_live_...")
   client = MolamClient(config)

   # Create test payment (small amount)
   payment = client.create_payment_intent(
       PaymentIntentCreate(amount=0.01, currency="USD"),
       idempotency_key="prod-smoke-test-123"
   )
   print(f"✓ Production smoke test passed: {payment.id}")
   ```

---

## Smoke Tests

### Quick Smoke Test (2 minutes)

```bash
#!/bin/bash
# smoke-test.sh

set -euo pipefail

echo "==> Running Molam SDK Smoke Tests"

# Test 1: Package import
python3 -c "from molam_sdk import MolamClient, PaymentIntentCreate; print('✓ Import successful')"

# Test 2: Client initialization
python3 -c "
from molam_sdk import MolamClient, ClientConfig
config = ClientConfig(api_key='sk_test_dummy')
client = MolamClient(config)
print('✓ Client initialization successful')
"

# Test 3: Create payment (sandbox)
MOLAM_SANDBOX_KEY="${MOLAM_SANDBOX_KEY}" python3 << 'EOF'
import os
from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate

config = ClientConfig(
    api_key=os.getenv('MOLAM_SANDBOX_KEY'),
    base_url='https://sandbox.api.molam.io'
)
client = MolamClient(config)
payment = client.create_payment_intent(
    PaymentIntentCreate(amount=1.0, currency='USD'),
    idempotency_key='smoke-test-123'
)
print(f'✓ Payment created: {payment.id}')
EOF

echo "==> All smoke tests passed!"
```

### Comprehensive Test Suite

```bash
# Run full integration test suite
pytest tests/integration/ -v --tb=short \
  --junit-xml=test-results.xml

# Generate coverage report
pytest tests/ --cov=molam_sdk --cov-report=html
```

---

## Rollback Procedures

### Scenario 1: SDK Bug Discovered

**Immediate Actions:**
1. Pin consumer applications to previous working version
   ```bash
   # In requirements.txt or pyproject.toml
   molam-python-sdk==0.0.9  # Previous known-good version
   ```

2. Redeploy consumer applications
   ```bash
   pip install --force-reinstall molam-python-sdk==0.0.9
   ```

3. Remove broken version from PyPI (if possible)
   ```bash
   # Contact PyPI admin to yank release
   # Or use artifactory API to delete artifact
   ```

### Scenario 2: Circuit Breaker Tripping

**Symptoms:**
- High rate of `CircuitBreakerError` exceptions
- Metrics show circuit state = OPEN

**Actions:**
1. Check upstream API health
   ```bash
   curl -v https://api.molam.io/health
   ```

2. If API is healthy, increase circuit breaker thresholds temporarily
   ```python
   # In application code
   client = MolamSyncClient(
       config,
       cb_fail_max=10,  # Increase from default 5
       cb_reset_timeout=120  # Increase from default 60
   )
   ```

3. Investigate root cause (slow endpoints, timeouts, etc.)

### Scenario 3: Dependency Vulnerability

**Actions:**
1. Run security audit
   ```bash
   poetry run safety check
   poetry run bandit -r molam_sdk
   ```

2. Update vulnerable dependency
   ```bash
   poetry update <package-name>
   ```

3. Release patch version (0.1.1)

4. Force update in all consumers
   ```bash
   pip install --upgrade molam-python-sdk
   ```

---

## Monitoring & Alerts

### Key Metrics

| Metric | Threshold | Alert Level |
|--------|-----------|-------------|
| `molam_sdk_requests_total{code="5xx"}` | > 1% of total | WARNING |
| `molam_sdk_requests_total{code="5xx"}` | > 5% of total | CRITICAL |
| `molam_sdk_request_latency_seconds` | p99 > 5s | WARNING |
| Circuit breaker state | OPEN | CRITICAL |
| SDK import errors | > 0 | CRITICAL |

### Prometheus Queries

```promql
# Error rate
rate(molam_sdk_requests_total{code=~"5.."}[5m]) /
rate(molam_sdk_requests_total[5m])

# P99 latency
histogram_quantile(0.99,
  rate(molam_sdk_request_latency_seconds_bucket[5m])
)

# Circuit breaker trips
increase(circuit_breaker_state_changes_total[1h])
```

### Log Analysis

```bash
# Find errors in last hour
journalctl -u myapp --since "1 hour ago" | \
  grep "molam_sdk" | \
  grep -i "error" | \
  jq -r '.msg'

# Top error types
grep "molam_sdk" /var/log/app/app.log | \
  jq -r '.level' | \
  sort | uniq -c | sort -rn
```

---

## Troubleshooting

### Issue: Import Errors

**Symptoms:**
```python
ModuleNotFoundError: No module named 'molam_sdk'
```

**Resolution:**
```bash
# Verify installation
pip show molam-python-sdk

# Reinstall if missing
pip install molam-python-sdk==0.1.0
```

### Issue: Authentication Failures

**Symptoms:**
```
APIError 401: Invalid API key
```

**Resolution:**
1. Verify API key format
   ```python
   # Should start with sk_ or jwt_
   assert config.api_key.startswith(('sk_', 'jwt_'))
   ```

2. Check key is not expired (for JWTs)

3. Verify key has correct permissions in Molam Dashboard

### Issue: Timeout Errors

**Symptoms:**
```
MolamTimeoutError: Request timeout after 10.0s
```

**Resolution:**
1. Increase timeouts
   ```python
   config = ClientConfig(
       api_key="...",
       timeout_connect=5.0,  # Increase from default 1.0
       timeout_read=30.0     # Increase from default 10.0
   )
   ```

2. Check network latency
   ```bash
   ping api.molam.io
   traceroute api.molam.io
   ```

3. Review API performance metrics

### Issue: Circuit Breaker Open

**Symptoms:**
```
CircuitBreakerError: Circuit breaker is open
```

**Resolution:**
1. Wait for reset timeout (default: 60s)
2. Check circuit breaker metrics
3. If persistent, investigate upstream API health

---

## Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Production down, all payments failing | 15 minutes |
| P1 | Degraded performance, >5% error rate | 1 hour |
| P2 | Minor issues, <5% error rate | 4 hours |
| P3 | Enhancement requests | Next sprint |

### P0 Incident Procedure

1. **Immediate Response (0-5 min)**
   - Page on-call engineer
   - Create incident channel (#incident-YYYY-MM-DD)
   - Begin status page updates

2. **Investigation (5-15 min)**
   - Check monitoring dashboards
   - Review recent deployments
   - Analyze error logs

3. **Mitigation (15-30 min)**
   - Roll back to last known-good version
   - Apply hotfix if identified
   - Communicate with stakeholders

4. **Recovery (30-60 min)**
   - Verify metrics returning to normal
   - Run smoke tests
   - Update status page

5. **Post-Mortem (within 48 hours)**
   - Document root cause
   - Identify action items
   - Update runbook

---

## Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | oncall@molam.io | PagerDuty |
| SDK Team Lead | sdk-team@molam.io | Slack: #sdk-team |
| DevOps | devops@molam.io | Slack: #devops |
| Security | security@molam.io | security@molam.io |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-01-16 | Initial release with circuit breaker, async client, metrics |

---

**Document Owner**: Molam SDK Team
**Review Frequency**: Quarterly
**Last Reviewed**: 2025-01-16
