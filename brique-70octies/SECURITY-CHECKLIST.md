# Brique 70octies - Security Checklist

## 🔒 Pre-Production Security Review

**Version:** 2.0.0-industrial
**Review Date:** ___________
**Reviewed By:** ___________
**Approved By:** ___________

---

## 1. Authentication & Authorization

### ✅ JWT Integration

- [ ] **Molam ID integration completed**
  - [ ] JWT validation implemented in `authenticate()` middleware
  - [ ] Token expiry checked (reject expired tokens)
  - [ ] Token signature verified with public key
  - [ ] Claims validated (userId, role, merchantId)

- [ ] **Token security**
  - [ ] HTTPS enforced for all API endpoints
  - [ ] Tokens transmitted only in Authorization header
  - [ ] Tokens not logged or stored in plain text
  - [ ] Refresh token mechanism implemented

- [ ] **Session management**
  - [ ] Session timeout configured (recommended: 1 hour)
  - [ ] Concurrent session limit enforced
  - [ ] Logout endpoint revokes tokens

**Test:**
```bash
# Test expired token rejection
curl -X GET http://localhost:3077/api/programs \
  -H "Authorization: Bearer <expired_token>"
# Expected: 401 Unauthorized
```

---

### ✅ RBAC Enforcement

- [ ] **Role verification**
  - [ ] All protected endpoints use `requireRole()` or `requirePermission()`
  - [ ] System role restricted to internal services only
  - [ ] Merchant isolation enforced (`verifyMerchantAccess()`)

- [ ] **Permission matrix validated**
  - [ ] merchant_admin: Read-only to own programs ✓
  - [ ] ops_marketing: Cannot directly adjust balances >10k ✓
  - [ ] finance_ops: Can approve but not create fraud flags ✓
  - [ ] auditor: Read-only, no write permissions ✓

- [ ] **Multi-sig approval**
  - [ ] Thresholds configured appropriately
    - [ ] Balance adjustments >10,000 points
    - [ ] Budget increases >$50,000
    - [ ] Program suspension
  - [ ] Approval workflow tested end-to-end
  - [ ] Approval bypass checks implemented (no backdoors)

**Test:**
```bash
# Test role enforcement
curl -X POST http://localhost:3077/api/balances/<id>/adjust \
  -H "Authorization: Bearer <merchant_admin_token>" \
  -d '{"amount": 15000}'
# Expected: 403 Forbidden OR 202 Approval Required
```

---

## 2. Data Protection

### ✅ PII Encryption

- [ ] **Encryption at rest**
  - [ ] KMS/Vault integration completed
  - [ ] `encrypted_meta` column uses AES-256-GCM
  - [ ] Encryption keys rotated regularly (every 90 days)
  - [ ] Master key stored in HSM or cloud KMS

- [ ] **Sensitive data identification**
  - [ ] User email (if stored)
  - [ ] Phone numbers
  - [ ] Payment information
  - [ ] Government IDs

- [ ] **Encryption helper functions**
  - [ ] `encryptPII(data)` implemented
  - [ ] `decryptPII(encrypted)` implemented
  - [ ] Error handling (key not found, decryption failure)

**Code Location:**
```typescript
// TODO: Implement in src/services/encryption.ts
export async function encryptPII(data: any): Promise<Buffer> {
  // Use KMS to encrypt
}

export async function decryptPII(encrypted: Buffer): Promise<any> {
  // Use KMS to decrypt
}
```

**Test:**
```bash
# Verify encryption
psql -d molam_connect -c "
SELECT encrypted_meta FROM loyalty_balances WHERE user_id = '<test_user>' LIMIT 1;
"
# Expected: Binary data (not plain text)
```

---

### ✅ SQL Injection Prevention

- [ ] **Parameterized queries**
  - [ ] All `pool.query()` calls use placeholders ($1, $2, etc.)
  - [ ] No string concatenation for SQL queries
  - [ ] User input never directly interpolated

- [ ] **Input validation**
  - [ ] UUIDs validated with regex
  - [ ] Amounts validated (positive numbers, max decimals)
  - [ ] Enums validated (tier, role, event_type)
  - [ ] Array inputs sanitized

**Vulnerable Pattern (NEVER DO THIS):**
```typescript
// ❌ VULNERABLE
const query = `SELECT * FROM loyalty_balances WHERE user_id = '${userId}'`;
await pool.query(query);

// ✅ SAFE
await pool.query('SELECT * FROM loyalty_balances WHERE user_id = $1', [userId]);
```

**Test:**
```bash
# Test SQL injection attempt
curl -X GET "http://localhost:3077/api/balances/'; DROP TABLE loyalty_balances; --"
# Expected: 400 Bad Request or 404 Not Found (NOT success)
```

---

### ✅ API Rate Limiting

- [ ] **Rate limits configured**
  - [ ] Per-IP: 100 req/min (global)
  - [ ] Per-user: 1000 req/min (authenticated)
  - [ ] Per-program: 10,000 ingestion events/min

- [ ] **Rate limit headers**
  - [ ] `X-RateLimit-Limit`
  - [ ] `X-RateLimit-Remaining`
  - [ ] `X-RateLimit-Reset`

- [ ] **DDoS protection**
  - [ ] Cloudflare or AWS WAF configured
  - [ ] Burst protection enabled
  - [ ] IP blacklist capability

**Implementation:**
```typescript
// TODO: Add to src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.'
});
```

---

## 3. Fraud Detection

### ✅ Fraud Rules Active

- [ ] **Velocity checks**
  - [ ] Max 50 transactions per user per day
  - [ ] Max 10,000 points earned per user per day
  - [ ] Max 5 redemptions per user per day

- [ ] **Pattern detection**
  - [ ] Multiple accounts from same IP flagged
  - [ ] Rapid redemption after earn (< 5 min) flagged
  - [ ] High-frequency transactions (>10/min) flagged

- [ ] **Automated freezing**
  - [ ] Accounts frozen automatically if fraud score >0.9
  - [ ] Manual review required for unfreeze
  - [ ] Alerts sent to fraud team

**Configuration:**
```sql
UPDATE loyalty_programs
SET fraud_detection_enabled = TRUE,
    max_earn_per_day = 10000
WHERE status = 'active';
```

**Test:**
```bash
# Simulate velocity attack
for i in {1..60}; do
  curl -X POST http://localhost:3077/api/award \
    -H "Authorization: Bearer <token>" \
    -d '{"programId": "xxx", "userId": "test", "amount": 100}'
done
# Expected: Account frozen after threshold
```

---

### ✅ Fraud Monitoring

- [ ] **Prometheus alerts configured**
  - [ ] `loyalty_fraud_detections_total` spike alert (>10/min)
  - [ ] `loyalty_account_freezes_total` spike alert (>5/min)
  - [ ] Churn risk anomaly detection (sudden spike)

- [ ] **Daily fraud report**
  - [ ] Frozen accounts reviewed
  - [ ] Fraud flags analyzed
  - [ ] False positives identified

**Alert Rule (Prometheus):**
```yaml
- alert: FraudDetectionSpike
  expr: rate(loyalty_fraud_detections_total[5m]) > 10
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Fraud detection spike detected"
```

---

## 4. Audit & Compliance

### ✅ Audit Trail

- [ ] **All operations logged**
  - [ ] Program creation/update/suspension
  - [ ] Balance adjustments
  - [ ] Tier upgrades
  - [ ] Campaign executions
  - [ ] Approval requests/approvals

- [ ] **Audit log fields complete**
  - [ ] Entity type and ID
  - [ ] Action (create, update, delete, etc.)
  - [ ] Actor ID and role
  - [ ] IP address
  - [ ] User agent
  - [ ] Changes JSONB (before/after)
  - [ ] Timestamp

- [ ] **Audit log retention**
  - [ ] Retention period: 7 years (or per compliance requirements)
  - [ ] Archive to cold storage after 1 year
  - [ ] Immutable storage (write-once)

**Query Test:**
```bash
psql -d molam_connect -c "
SELECT COUNT(*) as audit_entries_today
FROM loyalty_audit_logs
WHERE created_at >= CURRENT_DATE;
"
# Expected: >0 if any operations occurred today
```

---

### ✅ Compliance Requirements

- [ ] **GDPR (if applicable)**
  - [ ] User data export capability
  - [ ] Right to erasure (account deletion)
  - [ ] Consent tracking
  - [ ] Data processing agreement with merchants

- [ ] **PCI-DSS (if storing payment data)**
  - [ ] No credit card data stored (use tokenization)
  - [ ] Audit logs reviewed quarterly
  - [ ] Access logs monitored

- [ ] **SOC 2 Type II (if seeking certification)**
  - [ ] Access controls documented
  - [ ] Change management process
  - [ ] Incident response plan
  - [ ] Penetration testing annually

---

## 5. Infrastructure Security

### ✅ Database Security

- [ ] **PostgreSQL hardening**
  - [ ] SSL/TLS enabled for connections
  - [ ] Password authentication (not trust)
  - [ ] Least privilege user accounts
  - [ ] Row-level security (RLS) enabled for multi-tenancy

- [ ] **Backup & recovery**
  - [ ] Automated daily backups
  - [ ] Backup encryption enabled
  - [ ] Disaster recovery tested (RTO < 1 hour, RPO < 15 min)
  - [ ] Point-in-time recovery capability

- [ ] **Network isolation**
  - [ ] Database in private subnet
  - [ ] No public IP address
  - [ ] Firewall rules restrict access to app servers only

**Connection String Security:**
```bash
# ✅ GOOD - Using environment variable
export DB_PASSWORD=$(cat /secrets/db_password)

# ❌ BAD - Hardcoded password
DB_PASSWORD=my_password_123
```

---

### ✅ API Security

- [ ] **HTTPS enforcement**
  - [ ] TLS 1.2+ only (TLS 1.0/1.1 disabled)
  - [ ] Valid SSL certificate
  - [ ] HSTS header enabled
  - [ ] Redirect HTTP → HTTPS

- [ ] **CORS configuration**
  - [ ] Allowed origins whitelist (no wildcards)
  - [ ] Credentials allowed only for trusted origins
  - [ ] Preflight requests validated

- [ ] **Security headers**
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: DENY`
  - [ ] `X-XSS-Protection: 1; mode=block`
  - [ ] `Content-Security-Policy` configured
  - [ ] `Strict-Transport-Security: max-age=31536000`

**Express Configuration:**
```typescript
import helmet from 'helmet';
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
```

---

### ✅ Secrets Management

- [ ] **No secrets in code**
  - [ ] No passwords in source code
  - [ ] No API keys in source code
  - [ ] `.env` file in `.gitignore`

- [ ] **Environment variables**
  - [ ] All secrets loaded from env vars or secrets manager
  - [ ] Production secrets separate from staging/dev
  - [ ] Secrets rotated every 90 days

- [ ] **Secrets manager**
  - [ ] AWS Secrets Manager / Azure Key Vault / GCP Secret Manager
  - [ ] Access logged and audited
  - [ ] Least privilege IAM policies

**Checklist:**
```bash
# Verify no secrets in git history
git log -p | grep -i "password\|secret\|api_key"
# Expected: No results

# Verify .env not committed
git ls-files | grep "\.env$"
# Expected: No results
```

---

## 6. Monitoring & Alerting

### ✅ Security Monitoring

- [ ] **Alerts configured**
  - [ ] Failed authentication attempts (>10/min)
  - [ ] Unauthorized access attempts (403 errors >20/min)
  - [ ] Budget exhaustion
  - [ ] Fraud detection spike
  - [ ] Account freeze spike
  - [ ] Worker failures
  - [ ] Database connection failures

- [ ] **Anomaly detection**
  - [ ] Unusual traffic patterns
  - [ ] Sudden increase in error rates
  - [ ] Churn risk spikes

- [ ] **Incident response**
  - [ ] On-call rotation established
  - [ ] Escalation path documented
  - [ ] Incident playbook created

---

### ✅ Metrics & Logs

- [ ] **Prometheus metrics**
  - [ ] All business metrics tracked
  - [ ] Performance metrics tracked
  - [ ] Error metrics tracked
  - [ ] Grafana dashboards created

- [ ] **Centralized logging**
  - [ ] Application logs sent to ELK/Splunk/CloudWatch
  - [ ] Log retention: 90 days (hot), 1 year (warm)
  - [ ] PII not logged (or masked)
  - [ ] Request IDs for traceability

**Log Security:**
```typescript
// ❌ NEVER log sensitive data
logger.info(`User ${userId} password: ${password}`); // VULNERABLE

// ✅ Log safely
logger.info(`User ${userId} authenticated successfully`); // SAFE
```

---

## 7. Code Security

### ✅ Dependency Scanning

- [ ] **npm audit**
  - [ ] Run before every deployment
  - [ ] Critical vulnerabilities resolved
  - [ ] High vulnerabilities assessed

- [ ] **Automated scanning**
  - [ ] Snyk / Dependabot / WhiteSource configured
  - [ ] Pull requests blocked if vulnerabilities found
  - [ ] Dependencies updated monthly

**Command:**
```bash
npm audit --audit-level=high
npm audit fix
```

---

### ✅ Code Review

- [ ] **Security checklist for PRs**
  - [ ] No hardcoded secrets
  - [ ] SQL injection risks reviewed
  - [ ] XSS risks reviewed (if user input rendered)
  - [ ] Authentication/authorization checked
  - [ ] Rate limiting applied

- [ ] **Security champion**
  - [ ] Designated security reviewer on team
  - [ ] Security training completed

---

## 8. Penetration Testing

### ✅ Vulnerability Assessment

- [ ] **Before production launch**
  - [ ] OWASP Top 10 tested
  - [ ] SQL injection attempts
  - [ ] XSS attempts
  - [ ] CSRF attempts
  - [ ] Authorization bypass attempts
  - [ ] Rate limit bypass attempts

- [ ] **Findings remediated**
  - [ ] Critical: Fixed before launch
  - [ ] High: Fixed within 7 days
  - [ ] Medium: Fixed within 30 days

- [ ] **Re-test**
  - [ ] All findings verified fixed
  - [ ] Penetration test report approved

---

## 9. Incident Response

### ✅ Incident Response Plan

- [ ] **Roles defined**
  - [ ] Incident commander
  - [ ] Technical lead
  - [ ] Communications lead
  - [ ] Legal/compliance

- [ ] **Procedures documented**
  - [ ] Detection → Containment → Eradication → Recovery
  - [ ] Communication templates
  - [ ] Escalation paths

- [ ] **Tested**
  - [ ] Tabletop exercise conducted
  - [ ] Lessons learned documented

---

## 10. Sign-Off

### Security Review

| Reviewer | Role | Date | Signature |
|----------|------|------|-----------|
| ___________ | Security Engineer | ______ | _______ |
| ___________ | Tech Lead | ______ | _______ |
| ___________ | CISO / Security Manager | ______ | _______ |

### Production Approval

| Approver | Role | Date | Signature |
|----------|------|------|-----------|
| ___________ | VP Engineering | ______ | _______ |
| ___________ | CTO | ______ | _______ |

---

## 📝 Notes

Add any additional security considerations or exceptions here:

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-10
**Next Review:** 2025-12-10 (monthly)
