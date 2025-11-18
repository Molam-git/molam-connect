# Security Policy

**Version**: 0.1.0
**Last Updated**: 2025-01-16
**Security Contact**: security@molam.io

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Supported Versions](#supported-versions)
3. [Reporting Vulnerabilities](#reporting-vulnerabilities)
4. [Secret Management](#secret-management)
5. [TLS & Transport Security](#tls--transport-security)
6. [Dependency Security](#dependency-security)
7. [Key Rotation](#key-rotation)
8. [Security Best Practices](#security-best-practices)
9. [Compliance](#compliance)

---

## Security Overview

The Molam Python SDK is built with security as a core principle:

- ✅ **No secrets in code** - All API keys from environment or vault
- ✅ **TLS enforcement** - All API calls over HTTPS with certificate validation
- ✅ **Constant-time comparisons** - HMAC verification prevents timing attacks
- ✅ **Dependency scanning** - Regular audits with bandit and safety
- ✅ **Input validation** - Pydantic models validate all inputs
- ✅ **Structured logging** - Sensitive data sanitization

---

## Supported Versions

| Version | Supported | Security Updates |
|---------|-----------|------------------|
| 0.1.x   | ✅ Yes    | Active           |
| < 0.1.0 | ❌ No     | Upgrade required |

**Note**: Only the latest minor version receives security updates.

---

## Reporting Vulnerabilities

### How to Report

**🚨 DO NOT create public GitHub issues for security vulnerabilities**

Instead, email: **security@molam.io** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Initial Response | 24 hours |
| Triage & Assessment | 3 business days |
| Fix Development | 7-14 days (critical: 48 hours) |
| Patch Release | Within 24 hours of fix |
| Public Disclosure | 30 days after patch |

### Security Acknowledgments

We maintain a security acknowledgments file for responsible disclosure. Contributors who report valid vulnerabilities will be credited (with permission).

---

## Secret Management

### API Keys

**Storage Requirements:**

1. **Never commit secrets to version control**
   ```bash
   # ❌ WRONG
   config = ClientConfig(api_key="sk_live_abc123")

   # ✅ CORRECT
   import os
   config = ClientConfig(api_key=os.getenv("MOLAM_API_KEY"))
   ```

2. **Use environment variables**
   ```bash
   export MOLAM_API_KEY="sk_live_..."
   ```

3. **Production: Use Vault or Secrets Manager**
   ```python
   # HashiCorp Vault example
   import hvac

   client = hvac.Client(url='https://vault.internal')
   secret = client.secrets.kv.v2.read_secret_version(
       path='molam/api-key'
   )
   api_key = secret['data']['data']['key']

   config = ClientConfig(api_key=api_key)
   ```

### CI/CD Secrets

**GitHub Actions:**
```yaml
env:
  MOLAM_API_KEY: ${{ secrets.MOLAM_API_KEY }}
```

**Requirements:**
- ✅ Use GitHub Secrets or equivalent
- ✅ Never log secret values
- ✅ Use ephemeral tokens when possible
- ✅ Rotate after every suspected compromise

---

## TLS & Transport Security

### Certificate Validation

**Default behavior: TLS verification ENABLED**

```python
# ✅ Secure (default)
config = ClientConfig(
    api_key="...",
    verify_ssl=True  # Default
)

# ❌ NEVER disable in production
config = ClientConfig(
    api_key="...",
    verify_ssl=False  # Only for testing!
)
```

### mTLS (Mutual TLS)

For sensitive endpoints (treasury, bank connectors):

```python
config = ClientConfig(
    api_key="...",
    mtls_cert="/path/to/client.crt",
    mtls_key="/path/to/client.key"
)
```

**mTLS Certificate Requirements:**
- ✅ Store certificates in secure vault (not filesystem)
- ✅ Rotate every 90 days
- ✅ Use strong key sizes (RSA 2048+, ECDSA P-256+)
- ✅ Monitor expiration dates

### Webhook Signature Verification

**Always verify webhook signatures:**

```python
from molam_sdk import MolamClient

# HMAC-SHA256 verification with constant-time comparison
is_valid = MolamClient.verify_webhook_signature(
    signature_header=request.headers['Molam-Signature'],
    payload=request.body,
    secret_provider=get_secret_by_kid
)

if not is_valid:
    return 401  # Unauthorized
```

**Features:**
- ✅ Constant-time comparison (prevents timing attacks)
- ✅ Timestamp validation (5-minute tolerance, prevents replay)
- ✅ Multi-key support via `kid` (key rotation)

---

## Dependency Security

### Security Scanning

**Run before every release:**

```bash
# Check for known vulnerabilities
poetry run safety check

# Static analysis security testing
poetry run bandit -r molam_sdk

# Dependency audit
pip-audit
```

### Dependency Pinning

**pyproject.toml uses caret requirements:**
```toml
[tool.poetry.dependencies]
requests = "^2.31.0"  # >= 2.31.0, < 3.0.0
pydantic = "^2.5.0"   # >= 2.5.0, < 3.0.0
```

**For production, pin exact versions:**
```bash
poetry export -f requirements.txt --without-hashes > requirements.txt
```

### Update Policy

| Severity | Update Timeline |
|----------|----------------|
| Critical (CVSS 9.0+) | Immediate (24h) |
| High (CVSS 7.0-8.9) | 7 days |
| Medium (CVSS 4.0-6.9) | 30 days |
| Low (CVSS < 4.0) | Next release |

---

## Key Rotation

### API Key Rotation Procedure

**Frequency**: Every 90 days (recommended) or immediately on compromise

**Steps:**

1. **Generate new key** in Molam Dashboard
2. **Deploy new key** to all environments
   ```bash
   # Update in vault
   vault kv put secret/molam api_key="sk_live_new_key"
   ```

3. **Monitor for errors** (old key still active)
4. **Revoke old key** after 24-hour grace period
5. **Update documentation**

### Webhook Secret Rotation

**Using `kid` (key ID) parameter:**

```python
# Secrets provider supports multiple keys
def get_secret_by_kid(kid: str) -> str:
    secrets = {
        "v1": "old_secret_key",
        "v2": "new_secret_key"  # New key active
    }
    return secrets.get(kid, secrets["v2"])  # Default to latest
```

**Rotation process:**
1. Add new key with new `kid` ("v2")
2. Configure Molam API to send both `kid=v1` and `kid=v2` signatures
3. After 48 hours, remove old key
4. Update webhook configuration to use `kid=v2` only

---

## Security Best Practices

### Application Security Checklist

#### Configuration

- [ ] API keys stored in vault (not environment variables in production)
- [ ] TLS verification enabled (`verify_ssl=True`)
- [ ] mTLS configured for sensitive endpoints
- [ ] Timeouts configured (prevent hanging connections)
- [ ] Circuit breaker enabled (prevent cascade failures)

#### Runtime Security

- [ ] Input validation with Pydantic models
- [ ] Idempotency keys used for mutating operations
- [ ] Webhook signatures verified
- [ ] Structured logging with sensitive data sanitization
- [ ] Error handling doesn't leak sensitive info

#### Monitoring

- [ ] Prometheus metrics exposed
- [ ] Alerts configured for:
  - High error rates (> 1%)
  - Circuit breaker trips
  - Authentication failures
  - Unusual latency (p99 > 5s)

#### Development

- [ ] Secrets not in source code
- [ ] `.env` files in `.gitignore`
- [ ] Pre-commit hooks run `bandit` and `safety`
- [ ] Code review required for security-sensitive changes

### Secure Coding Examples

#### ✅ Correct: Sanitized Logging

```python
from molam_sdk.logging_setup import sanitize_sensitive_data

log_data = sanitize_sensitive_data({
    "api_key": "sk_live_123",
    "amount": 100,
    "customer_id": "cus_abc"
})
logger.info("Payment created", extra=log_data)
# Logs: {"api_key": "***REDACTED***", "amount": 100, ...}
```

#### ❌ Wrong: Logging Secrets

```python
# DON'T DO THIS
logger.info(f"Using API key: {config.api_key}")
```

#### ✅ Correct: Idempotency

```python
import uuid

idempotency_key = f"payment-{uuid.uuid4()}"
payment = client.create_payment_intent(
    payload,
    idempotency_key=idempotency_key
)
```

#### ❌ Wrong: No Idempotency

```python
# Risk of duplicate payments
payment = client.create_payment_intent(payload)
```

---

## Compliance

### Standards Adherence

| Standard | Status | Notes |
|----------|--------|-------|
| PCI DSS | ✅ Compliant | No card data stored in SDK |
| GDPR | ✅ Compliant | No PII logging, data minimization |
| SOC 2 | 🔄 In Progress | Audit Q2 2025 |

### Data Handling

**SDK does NOT store:**
- ❌ Card numbers (PAN)
- ❌ CVV codes
- ❌ Customer PII (except IDs)
- ❌ API keys (only in memory during request)

**SDK logs:**
- ✅ Request IDs
- ✅ Timestamps
- ✅ Status codes
- ✅ Latencies
- ⚠️ Sanitized metadata (no secrets)

### Audit Trail

All SDK requests include:
- `X-Request-ID` header (for tracing)
- User-Agent: `molam-python-sdk/{version}`
- Structured logs with timestamps

---

## Vulnerability Disclosure History

| CVE | Severity | Affected Versions | Fixed in | Disclosure Date |
|-----|----------|-------------------|----------|-----------------|
| N/A | N/A | N/A | N/A | No vulnerabilities reported |

---

## Security Contacts

| Role | Contact | PGP Key |
|------|---------|---------|
| Security Team | security@molam.io | [Public Key](https://molam.io/.well-known/pgp-key.txt) |
| SDK Team | sdk-team@molam.io | - |
| On-Call (Urgent) | oncall@molam.io | - |

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Python Security Best Practices](https://python.readthedocs.io/en/latest/library/security_warnings.html)
- [Molam Security Portal](https://security.molam.io)

---

**Document Owner**: Molam Security Team
**Review Frequency**: Quarterly or after security incident
**Last Reviewed**: 2025-01-16
**Next Review**: 2025-04-16
