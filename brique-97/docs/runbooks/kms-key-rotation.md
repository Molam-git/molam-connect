# Runbook: KMS Key Rotation

**Severity**: Planned Maintenance
**Estimated Duration**: 4-6 hours
**Requires Downtime**: No (rolling rotation)

---

## Overview

This runbook covers the procedure for rotating the KMS master key used to encrypt payment method tokens. Key rotation is required every 90 days for PCI compliance.

---

## Prerequisites

- AWS KMS administrator access
- Database admin access
- Kubernetes cluster admin access
- Maintenance window scheduled
- Stakeholders notified

---

## Steps

### 1. Pre-Rotation Validation

#### 1.1 Verify Current Key

```bash
# Get current key ID
aws kms describe-key --key-id alias/molam-tokenization

# Check key usage
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=alias/molam-tokenization \
  --max-results 100
```

#### 1.2 Verify System Health

```bash
# Check API health
kubectl get pods -n molam -l app=molam-tokenization-api

# Check database connections
psql -h molam-tokenization.xxxxx.rds.amazonaws.com -U molam -d molam_tokenization -c "SELECT count(*) FROM payment_methods WHERE is_active = true;"

# Verify no active incidents
```

### 2. Create New Key

#### 2.1 Generate New KMS Key

```bash
# Create new key
aws kms create-key \
  --description "Molam Tokenization Master Key v2" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS

# Save key ID
export NEW_KEY_ID=<key-id-from-above>

# Create temporary alias
aws kms create-alias \
  --alias-name alias/molam-tokenization-v2 \
  --target-key-id $NEW_KEY_ID
```

#### 2.2 Update Key Policy

```bash
# Copy policy from old key
aws kms get-key-policy \
  --key-id alias/molam-tokenization \
  --policy-name default \
  --output text > old-key-policy.json

# Apply to new key
aws kms put-key-policy \
  --key-id $NEW_KEY_ID \
  --policy-name default \
  --policy file://old-key-policy.json
```

#### 2.3 Test New Key

```bash
# Test encryption
echo "test data" | aws kms encrypt \
  --key-id $NEW_KEY_ID \
  --plaintext fileb:///dev/stdin \
  --output text \
  --query CiphertextBlob > encrypted.txt

# Test decryption
aws kms decrypt \
  --ciphertext-blob fileb://encrypted.txt \
  --output text \
  --query Plaintext | base64 --decode

# Expected output: "test data"
```

### 3. Database Preparation

#### 3.1 Mark Old Key as Rotating

```sql
-- Connect to database
psql -h molam-tokenization.xxxxx.rds.amazonaws.com -U molam -d molam_tokenization

-- Update key status
UPDATE token_encryption_keys
SET status = 'rotating'
WHERE status = 'active';

-- Create new key record
INSERT INTO token_encryption_keys (key_id, key_version, status, algorithm, provider)
VALUES ('alias/molam-tokenization-v2', 'v2', 'active', 'AES-256-GCM', 'aws_kms');
```

#### 3.2 Create Re-encryption Function

```sql
CREATE OR REPLACE FUNCTION reencrypt_payment_method_token(
  p_payment_method_id UUID,
  p_old_key_id TEXT,
  p_new_key_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_encrypted_token BYTEA;
BEGIN
  -- This function would be implemented in application code
  -- Just a placeholder for tracking
  INSERT INTO payment_method_audit (
    payment_method_id,
    action,
    actor_type,
    details
  ) VALUES (
    p_payment_method_id,
    'token_reencrypted',
    'system',
    jsonb_build_object('old_key', p_old_key_id, 'new_key', p_new_key_id)
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql;
```

### 4. Re-encrypt Tokens

#### 4.1 Deploy Re-encryption Worker

```bash
# Create Kubernetes job for re-encryption
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: token-reencryption
  namespace: molam
spec:
  parallelism: 5
  template:
    spec:
      serviceAccountName: molam-tokenization-sa
      containers:
        - name: reencrypt
          image: molam/tokenization:1.0.0
          command: ["npm", "run", "reencrypt-tokens"]
          env:
            - name: OLD_KEY_ID
              value: "alias/molam-tokenization"
            - name: NEW_KEY_ID
              value: "alias/molam-tokenization-v2"
            - name: BATCH_SIZE
              value: "100"
      restartPolicy: OnFailure
EOF
```

#### 4.2 Monitor Progress

```bash
# Check job status
kubectl get jobs -n molam -w

# Check logs
kubectl logs -f job/token-reencryption -n molam

# Check database progress
psql -h molam-tokenization.xxxxx.rds.amazonaws.com -U molam -d molam_tokenization -c "
SELECT
  COUNT(*) FILTER (WHERE action = 'token_reencrypted' AND created_at > now() - interval '1 hour') as reencrypted_count,
  COUNT(*) FILTER (WHERE is_active = true) as total_active
FROM payment_methods pm
LEFT JOIN payment_method_audit pma ON pm.id = pma.payment_method_id;
"
```

#### 4.3 Verify Re-encryption

```bash
# Test a sample of re-encrypted tokens
kubectl exec -it deployment/molam-tokenization-api -n molam -- \
  npm run test:verify-reencryption
```

### 5. Switch to New Key

#### 5.1 Update Application Configuration

```bash
# Update ConfigMap
kubectl patch configmap molam-tokenization-config -n molam \
  --type merge \
  -p '{"data":{"kms-key-id":"alias/molam-tokenization-v2"}}'
```

#### 5.2 Rolling Restart

```bash
# Restart API pods (one at a time)
kubectl rollout restart deployment/molam-tokenization-api -n molam

# Watch rollout
kubectl rollout status deployment/molam-tokenization-api -n molam

# Verify new pods use new key
kubectl logs -l app=molam-tokenization-api -n molam --tail=50 | grep "KMS_KEY_ID"
```

### 6. Swap Aliases

#### 6.1 Remove Old Alias

```bash
# Remove old alias from old key
aws kms delete-alias --alias-name alias/molam-tokenization
```

#### 6.2 Point Alias to New Key

```bash
# Point main alias to new key
aws kms update-alias \
  --alias-name alias/molam-tokenization \
  --target-key-id $NEW_KEY_ID
```

#### 6.3 Verify

```bash
# Verify alias points to new key
aws kms describe-key --key-id alias/molam-tokenization

# Should show the new key ID
```

### 7. Retire Old Key

#### 7.1 Update Database

```sql
-- Mark old key as retired
UPDATE token_encryption_keys
SET status = 'retired', retired_at = now()
WHERE key_id = 'alias/molam-tokenization'
  AND status = 'rotating';
```

#### 7.2 Schedule Old Key Deletion (30 days)

```bash
# Schedule key deletion
aws kms schedule-key-deletion \
  --key-id <old-key-id> \
  --pending-window-in-days 30

# Note: Key can be restored within 30 days if needed
```

### 8. Post-Rotation Validation

#### 8.1 Test Tokenization Flow

```bash
# Run end-to-end test
kubectl exec -it deployment/molam-tokenization-api -n molam -- \
  npm run test:e2e

# Expected: All tests pass
```

#### 8.2 Test Charge with Token

```bash
# Test charging with a re-encrypted token
kubectl exec -it deployment/molam-tokenization-api -n molam -- \
  npm run test:charge-with-token

# Expected: Charge succeeds
```

#### 8.3 Verify Audit Logs

```sql
-- Check audit logs for rotation
SELECT
  action,
  COUNT(*),
  MIN(created_at) as started,
  MAX(created_at) as completed
FROM payment_method_audit
WHERE action = 'token_reencrypted'
  AND created_at > now() - interval '6 hours'
GROUP BY action;
```

### 9. Cleanup

#### 9.1 Delete Re-encryption Job

```bash
kubectl delete job token-reencryption -n molam
```

#### 9.2 Update Documentation

- [ ] Update key ID in documentation
- [ ] Update deployment guide
- [ ] Update disaster recovery procedures
- [ ] Notify stakeholders

---

## Rollback Procedure

If rotation fails:

### 1. Restore Old Alias

```bash
# Point alias back to old key
aws kms update-alias \
  --alias-name alias/molam-tokenization \
  --target-key-id <old-key-id>
```

### 2. Rollback Application

```bash
# Restore old ConfigMap
kubectl patch configmap molam-tokenization-config -n molam \
  --type merge \
  -p '{"data":{"kms-key-id":"<old-key-id>"}}'

# Restart pods
kubectl rollout restart deployment/molam-tokenization-api -n molam
```

### 3. Mark Keys

```sql
-- Restore old key status
UPDATE token_encryption_keys SET status = 'active' WHERE key_id = '<old-key-id>';

-- Mark new key as failed
UPDATE token_encryption_keys SET status = 'retired' WHERE key_id = '<new-key-id>';
```

---

## Monitoring

During rotation, monitor:

- **CloudWatch**: KMS API calls, decrypt/encrypt errors
- **Prometheus**: `kms_decrypt_latency`, `kms_encrypt_errors`
- **Database**: Re-encryption progress query
- **Application Logs**: Decryption errors

---

## Success Criteria

- [ ] All payment method tokens re-encrypted
- [ ] New key active and alias updated
- [ ] Old key scheduled for deletion
- [ ] All tests passing
- [ ] No increase in error rates
- [ ] Audit trail complete
- [ ] Documentation updated

---

## Escalation

If issues arise:
- **Critical**: PagerDuty → Security team lead
- **Blocker**: Slack `#platform-security`
- **Questions**: Email security@molam.co

---

## Notes

- Key rotation is a PCI DSS requirement
- Schedule during low-traffic period
- Keep old key for 30 days for rollback
- Test rollback procedure in staging first

---

**Last Updated**: 2025-01-15
**Next Rotation Due**: 2025-04-15
