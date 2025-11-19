# Sous-Brique 115bis — Rollback Automatique & Safe Upgrade

Système de rollback automatique pour les mises à jour de plugins Molam Form (WooCommerce, PrestaShop, Shopify, etc.) afin d'éviter toute rupture d'encaissement.

## Objectif

**Zéro interruption de paiement** : Aucune mise à jour de plugin ne doit jamais casser les flux de paiement des marchands.

### Garanties

- ✅ Rollback automatique en cas d'échec d'upgrade
- ✅ Backup complet avant toute mise à jour (fichiers + base de données)
- ✅ Vérification post-upgrade avec smoke tests
- ✅ Restauration complète en moins de 5 secondes
- ✅ Audit trail complet de tous les rollbacks
- ✅ Dashboard temps réel pour le monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Upgrade Flow                      │
├─────────────────────────────────────────────────────────────┤
│  1. Check for new version (API call)                        │
│  2. Create backup (files + database)                        │
│  3. Download & verify checksum                              │
│  4. Apply upgrade (extract + migrations)                    │
│  5. Verify upgrade (smoke tests)                            │
│  6. Success → Mark as "rollback not_required"               │
│     OR                                                       │
│     Failure → Automatic rollback to previous version        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Automatic Rollback                       │
├─────────────────────────────────────────────────────────────┤
│  1. Detect upgrade failure (exception caught)               │
│  2. Find latest backup for previous version                 │
│  3. Restore files from backup                               │
│  4. Restore database tables                                 │
│  5. Verify payment processing works                         │
│  6. Log rollback to API                                     │
│  7. Alert ops team                                          │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables

**plugin_upgrade_logs** (extended)
```sql
ALTER TABLE plugin_upgrade_logs
  ADD COLUMN rollback_version TEXT,
  ADD COLUMN rollback_status TEXT, -- 'success' | 'failed' | 'not_required'
  ADD COLUMN rollback_triggered_at TIMESTAMPTZ,
  ADD COLUMN rollback_reason TEXT;
```

**plugin_backups** (new)
```sql
CREATE TABLE plugin_backups (
  backup_id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  version TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  db_snapshot_name TEXT,
  backup_size_bytes BIGINT,
  backup_status TEXT, -- 'pending' | 'completed' | 'failed'
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);
```

**plugin_rollback_history** (new)
```sql
CREATE TABLE plugin_rollback_history (
  rollback_id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  rollback_trigger TEXT NOT NULL, -- 'automatic' | 'manual' | 'operator_forced'
  success BOOLEAN NOT NULL,
  duration_ms INT,
  files_restored INT,
  db_restored BOOLEAN
);
```

## API Endpoints

### POST /api/plugins/rollback
Log a rollback event

**Request:**
```json
{
  "merchant_id": "123e4567-e89b-12d3-a456-426614174000",
  "plugin_name": "woocommerce",
  "rollback_version": "3.9.0",
  "status": "success",
  "reason": "Migration failed"
}
```

**Response:**
```json
{
  "ok": true,
  "upgrade_log": {
    "id": "abc-123",
    "rollback_status": "success",
    "rollback_version": "3.9.0"
  }
}
```

### POST /api/plugins/rollback/initiate
Initiate a rollback operation (creates rollback_id for tracking)

**Request:**
```json
{
  "merchant_id": "123e4567-e89b-12d3-a456-426614174000",
  "plugin_name": "woocommerce",
  "from_version": "4.0.0",
  "to_version": "3.9.0",
  "trigger": "automatic",
  "reason": "Upgrade verification failed"
}
```

**Response:**
```json
{
  "ok": true,
  "rollback_id": "rollback-xyz-789"
}
```

### POST /api/plugins/rollback/:rollback_id/complete
Mark rollback as completed

**Request:**
```json
{
  "success": true,
  "duration_ms": 1500,
  "files_restored": 125,
  "db_restored": true
}
```

### GET /api/plugins/rollback/history
Get rollback history

**Query Parameters:**
- `merchant_id` - Filter by merchant
- `plugin_name` - Filter by plugin
- `limit` - Max results (default: 50)
- `offset` - Pagination offset

**Response:**
```json
{
  "rollbacks": [
    {
      "rollback_id": "rollback-xyz-789",
      "merchant_id": "123e4567-...",
      "plugin_name": "woocommerce",
      "from_version": "4.0.0",
      "to_version": "3.9.0",
      "rollback_trigger": "automatic",
      "success": true,
      "duration_ms": 1500,
      "created_at": "2024-01-15T14:30:00Z"
    }
  ],
  "total": 1
}
```

### GET /api/plugins/rollback/stats
Get rollback statistics

**Response:**
```json
{
  "success_rate_by_plugin": [
    {
      "plugin_name": "woocommerce",
      "total_rollbacks": 42,
      "successful_rollbacks": 40,
      "success_rate_pct": 95.24,
      "avg_duration_ms": 1850
    }
  ],
  "rollbacks_last_24h": 5,
  "failed_rollbacks_last_7d": 2
}
```

### POST /api/plugins/backup
Create a backup before upgrade

**Request:**
```json
{
  "merchant_id": "123e4567-...",
  "plugin_name": "woocommerce",
  "version": "3.9.0",
  "backup_path": "/backups/woocommerce-3.9.0-2024-01-15.zip",
  "backup_size_bytes": 5242880
}
```

## PHP Integration (WooCommerce Example)

### Usage

```php
<?php
// Trigger safe upgrade
$result = Molam_Form_Upgrade::safe_upgrade('3.9.0');

if ($result['status'] === 'success') {
    echo "Upgrade successful! New version: " . $result['to_version'];
} else if ($result['status'] === 'failed') {
    echo "Upgrade failed, automatic rollback: " . $result['rollback_status'];
    echo "Error: " . $result['error'];
}
```

### Workflow

1. **Backup Phase**
   ```php
   self::backup($current_version);
   // Creates:
   // - /wp-content/molam-backups/molam-form-3.9.0-2024-01-15/
   // - wp_molam_orders_backup_390 (database table)
   ```

2. **Download & Verify**
   ```php
   $download_path = self::download_version($url, $checksum);
   // Downloads and verifies SHA256 checksum
   ```

3. **Apply Upgrade**
   ```php
   self::apply_upgrade($from, $to, $download_path);
   // Extracts files, runs migrations
   ```

4. **Verify**
   ```php
   self::verify_upgrade($to_version);
   // Checks version file + smoke tests payment processing
   ```

5. **Auto Rollback on Failure**
   ```php
   catch (Exception $e) {
       $rollback_result = self::rollback($current_version);
       // Restores files + database from backup
   }
   ```

## React Dashboard

### Features

- **Real-time Stats**
  - Total rollbacks (last 24h)
  - Failed rollbacks (last 7 days)
  - Overall success rate

- **Success Rate by Plugin**
  - Visual progress bars
  - Average rollback duration
  - Total rollback count

- **Rollback History Table**
  - Merchant ID
  - Plugin name
  - Version transition (from → to)
  - Trigger type (automatic/manual/operator_forced)
  - Success/failure status
  - Duration
  - Error details

- **Filters**
  - Filter by merchant ID
  - Filter by plugin name

### Access

```
http://localhost:3000/ops/rollback-dashboard
```

## Test Scenarios

### Case 1: Successful Upgrade (Rollback Not Required)

```javascript
// Upgrade succeeds → rollback_status = 'not_required'
const result = await safe_upgrade('3.9.0');
// result.status === 'success'
// result.rollback_status === 'not_required'
```

### Case 2: Failed Upgrade with Automatic Rollback

```javascript
// Upgrade fails (e.g., migration error)
// → Automatic rollback triggered
// → Payment processing verified to work

try {
  await apply_upgrade();
} catch (error) {
  const rollback = await rollback_to_version('3.9.0');
  // rollback.status === 'success'
  // rollback.files_restored === 125
  // rollback.db_restored === true
  // Payment processing: ✅ OK
}
```

### Case 3: Manual Operator-Forced Rollback

```bash
# Operator forces rollback via API
curl -X POST /api/plugins/rollback/initiate \
  -d '{
    "merchant_id": "...",
    "plugin_name": "woocommerce",
    "from_version": "4.0.0",
    "to_version": "3.9.0",
    "trigger": "operator_forced",
    "reason": "Performance degradation reported"
  }'

# Result: rollback_status = 'success'
```

## Deployment

### 1. Database Migration

```bash
psql -d molam -f brique-115bis/migrations/001_rollback_automatic.sql
```

### 2. Install PHP Class (WordPress/WooCommerce)

```bash
# Copy to plugin directory
cp brique-115bis/plugins/woocommerce/class-molam-form-upgrade.php \
   /var/www/html/wp-content/plugins/molam-form/includes/

# Include in main plugin file
// molam-form.php
require_once __DIR__ . '/includes/class-molam-form-upgrade.php';

// Hook to auto-upgrade check (daily cron)
add_action('molam_daily_upgrade_check', function() {
    $current_version = MOLAM_FORM_VERSION;
    Molam_Form_Upgrade::safe_upgrade($current_version);
});
```

### 3. Configure API Endpoints

```bash
# Add to server.js
const { router: rollbackRouter, setPool } = require('./brique-115bis/src/routes/rollback');
setPool(pool);
app.use('/api/plugins', rollbackRouter);
```

### 4. Deploy Dashboard

```bash
# Build React component
cd brique-115bis/src/components
npm run build

# Serve dashboard
app.use('/ops/rollback-dashboard', express.static('brique-115bis/dist'));
```

## Monitoring & Alerts

### Key Metrics

- **Rollback Success Rate**: Target > 95%
- **Average Rollback Duration**: Target < 3 seconds
- **Failed Rollbacks (7d)**: Alert if > 5
- **Rollbacks per Day**: Monitor trends

### Alert Rules

```yaml
# Prometheus Alert
- alert: HighRollbackFailureRate
  expr: |
    (sum(rollback_failures_7d) / sum(rollback_total_7d)) > 0.05
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Rollback failure rate > 5%"
```

### PagerDuty Integration

```javascript
// Auto-alert on failed rollback
if (rollback.success === false) {
  await pagerduty.trigger({
    severity: 'high',
    summary: `Plugin rollback failed: ${plugin_name}`,
    details: rollback.error_message,
    merchant_id: merchant_id
  });
}
```

## Security Considerations

- **Backup Encryption**: All backups encrypted at rest
- **Backup Retention**: 30 days retention, auto-cleanup
- **Access Control**: Only `ops_plugins` and `pay_admin` roles can trigger manual rollbacks
- **Audit Trail**: All rollbacks logged immutably in `plugin_rollback_history`
- **Checksum Verification**: All downloaded upgrades verified with SHA256

## Troubleshooting

### Rollback Failed

**Symptom**: Rollback completes but `success = false`

**Diagnosis**:
```sql
SELECT error_message, rollback_reason
FROM plugin_rollback_history
WHERE success = FALSE
ORDER BY created_at DESC
LIMIT 10;
```

**Common Causes**:
- Backup not found → Ensure backups are created before upgrades
- File permissions → Check write permissions on plugin directory
- Database restore failed → Verify backup table exists

### Backup Size Too Large

**Symptom**: Backup creation slow or fails

**Solution**:
```php
// Exclude non-essential files from backup
$exclude_dirs = ['node_modules', 'vendor', 'logs'];
```

### Payment Processing Broken After Rollback

**Symptom**: Smoke test fails after rollback

**Solution**:
```php
// Run manual verification
$test_result = Molam_Form_Upgrade::test_payment_processing();
if (!$test_result) {
    // Check class exists
    var_dump(class_exists('Molam_Payment_Gateway'));

    // Reactivate plugin
    deactivate_plugins('molam-form/molam-form.php');
    activate_plugin('molam-form/molam-form.php');
}
```

---

# Sous-Brique 115ter — Progressive Rollout & Canary Release

Extension de 115bis pour supporter les déploiements progressifs avec monitoring automatique Sira.

## Objectif

**Déploiement progressif sans risque** : Déployer les nouvelles versions graduellement avec détection automatique des problèmes.

### Garanties Additionnelles (115ter)

- ✅ Rollout progressif par pourcentage (5%, 10%, 25%, 50%, 100%)
- ✅ Stratégies de ciblage : Random, Géographique, Merchant Tier
- ✅ Monitoring Sira en temps réel avec auto-pause
- ✅ Seuil d'erreur configurable (défaut: 3%)
- ✅ Pause/reprise manuelle des rollouts
- ✅ Dashboard de contrôle en temps réel

## Architecture Intégrée (115bis + 115ter)

```
┌────────────────────────────────────────────────────────────────┐
│              Safe Upgrade System (Unified)                     │
├────────────────────────────────────────────────────────────────┤
│  1. Check for new version                                      │
│  2. Check progressive rollout eligibility (115ter)             │
│     ├─ No active rollout → skip upgrade                        │
│     ├─ Rollout paused → skip upgrade                           │
│     ├─ Not in rollout cohort → skip upgrade                    │
│     └─ Selected for rollout → continue                         │
│  3. Create backup (115bis)                                     │
│  4. Apply upgrade                                              │
│  5. Verify upgrade (smoke tests)                               │
│  6. Success OR Automatic Rollback (115bis)                     │
│                                                                │
│  [Parallel] Sira monitors error rate (115ter)                 │
│     └─ Error rate > threshold → Auto-pause rollout            │
└────────────────────────────────────────────────────────────────┘
```

## Database Schema (115ter Extensions)

### New Tables

**plugin_rollouts**
```sql
CREATE TABLE plugin_rollouts (
  id SERIAL PRIMARY KEY,
  plugin_name TEXT NOT NULL,
  version TEXT NOT NULL,
  rollout_percentage INT NOT NULL DEFAULT 0,      -- 0-100
  rollout_strategy TEXT NOT NULL DEFAULT 'random', -- 'random' | 'geo' | 'merchant_tier'
  status TEXT NOT NULL DEFAULT 'active',          -- 'active' | 'paused' | 'completed' | 'rolled_back'
  target_countries TEXT[],                        -- For 'geo': ['US', 'FR', 'SN']
  target_tiers TEXT[],                            -- For 'merchant_tier': ['enterprise', 'pro']
  sira_monitoring BOOLEAN DEFAULT TRUE,
  error_threshold NUMERIC(5,4) DEFAULT 0.03,      -- 3% errors max
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB
);
```

### Extended Tables

**plugin_rollback_history** (extended)
```sql
ALTER TABLE plugin_rollback_history
  ADD COLUMN sira_triggered BOOLEAN DEFAULT FALSE,
  ADD COLUMN error_rate_detected NUMERIC(5,4);
```

### Key SQL Functions

**should_merchant_upgrade()** - Deterministic merchant selection
```sql
SELECT should_merchant_upgrade(
  'merchant-uuid'::UUID,
  'woocommerce',
  'US',              -- merchant_country (optional)
  'enterprise'       -- merchant_tier (optional)
) as should_upgrade;
```

**get_rollout_error_rate()** - Calculate error rate for rollout
```sql
SELECT get_rollout_error_rate(rollout_id) as error_rate;
```

**auto_pause_failing_rollouts()** - Sira integration endpoint
```sql
SELECT auto_pause_failing_rollouts() as paused_count;
-- Called by Sira cron job every 5 minutes
```

## API Endpoints (115ter)

### POST /api/plugins/rollouts
Create a new progressive rollout

**Request:**
```json
{
  "plugin_name": "woocommerce",
  "version": "4.0.0",
  "percentage": 5,
  "strategy": "random",
  "error_threshold": 0.03
}
```

**Response:**
```json
{
  "ok": true,
  "rollout": {
    "id": 1,
    "plugin_name": "woocommerce",
    "version": "4.0.0",
    "rollout_percentage": 5,
    "status": "active"
  }
}
```

### GET /api/plugins/rollouts/:plugin_name
Get active rollout for a plugin

**Response:**
```json
{
  "rollout": {
    "id": 1,
    "plugin_name": "woocommerce",
    "version": "4.0.0",
    "rollout_percentage": 25,
    "rollout_strategy": "geo",
    "target_countries": ["US", "FR"],
    "status": "active",
    "merchants_upgraded": 142,
    "error_rate": 0.012
  }
}
```

### PATCH /api/plugins/rollouts/:id
Update rollout percentage or status

**Request:**
```json
{
  "percentage": 25
}
```

### POST /api/plugins/rollouts/:id/pause
Pause a rollout (manual or Sira-triggered)

### POST /api/plugins/rollouts/auto-check
Sira cron endpoint to check and pause failing rollouts

**Response:**
```json
{
  "ok": true,
  "paused_count": 1,
  "paused_rollouts": [
    {
      "rollout_id": 5,
      "plugin_name": "woocommerce",
      "error_rate": 0.047,
      "threshold": 0.03
    }
  ]
}
```

### GET /api/plugins/rollouts
List all rollouts with optional filters

**Query Parameters:**
- `status` - Filter by status (active/paused/completed)
- `plugin_name` - Filter by plugin
- `include_metrics` - Include upgrade metrics (default: false)

## Progressive Rollout Strategies

### 1. Random Selection
Selects merchants randomly based on deterministic hash of merchant_id.

**Use case:** General rollouts, A/B testing

```json
{
  "strategy": "random",
  "percentage": 10
}
```

### 2. Geographic Targeting
Target specific countries first.

**Use case:** Region-specific rollouts, timezone-based deployments

```json
{
  "strategy": "geo",
  "percentage": 50,
  "target_countries": ["US", "FR", "SN"]
}
```

### 3. Merchant Tier Targeting
Prioritize enterprise or pro merchants.

**Use case:** Deploy to high-value merchants first with extra monitoring

```json
{
  "strategy": "merchant_tier",
  "percentage": 25,
  "target_tiers": ["enterprise", "pro"]
}
```

## PHP Integration (115ter)

### Check Rollout Eligibility

```php
<?php
require_once __DIR__ . '/class-molam-form-rollout.php';

$merchant_id = get_current_user_id();
$decision = Molam_Form_Rollout::should_upgrade(
    $merchant_id,
    'woocommerce',
    '4.0.0'
);

if ($decision['should_upgrade']) {
    // Proceed with safe_upgrade()
    $result = Molam_Form_Upgrade::safe_upgrade($current_version);
} else {
    // Skip upgrade
    echo "Upgrade skipped: " . $decision['reason'];
}
```

### Force Upgrade (Bypass Rollout)

```php
<?php
// Force upgrade even if not in rollout cohort
// Useful for testing or manual operator action
$result = Molam_Form_Upgrade::safe_upgrade($current_version, $force_upgrade = true);
```

### Rollout Decision Response

```php
[
  'should_upgrade' => true,
  'reason' => 'Merchant selected for 25% rollout (geo strategy)',
  'rollout_id' => 5,
  'rollout_percentage' => 25,
  'rollout_strategy' => 'geo',
  'version' => '4.0.0'
]
```

## React Dashboard (Rollout Control)

### Access

```
http://localhost:3000/ops/rollout-control
```

### Features

- **Create New Rollouts**
  - Select plugin and target version
  - Choose strategy (random/geo/merchant_tier)
  - Set initial percentage
  - Configure error threshold

- **Monitor Active Rollouts**
  - Real-time metrics (merchants upgraded, error rate)
  - Visual progress bars
  - Sira monitoring status

- **Control Rollout Progression**
  - Increase percentage (+10%, +25%, 100%)
  - Pause/resume rollouts
  - Mark as completed

- **Alert Indicators**
  - Red error rate when exceeds threshold
  - Auto-paused status visible
  - Sira-triggered events highlighted

## Typical Rollout Flow

### Phase 1: Initial Canary (5%)

```bash
curl -X POST /api/plugins/rollouts \
  -H "Content-Type: application/json" \
  -d '{
    "plugin_name": "woocommerce",
    "version": "4.0.0",
    "percentage": 5,
    "strategy": "random",
    "error_threshold": 0.03
  }'
```

**Monitor for 24-48 hours**
- Check error rate in dashboard
- Review rollback logs
- Sira monitoring active

### Phase 2: Increase to 25%

```bash
curl -X PATCH /api/plugins/rollouts/1 \
  -d '{"percentage": 25}'
```

**Monitor for 24 hours**

### Phase 3: Increase to 50%

```bash
curl -X PATCH /api/plugins/rollouts/1 \
  -d '{"percentage": 50}'
```

**Monitor for 12 hours**

### Phase 4: Complete Rollout (100%)

```bash
curl -X PATCH /api/plugins/rollouts/1 \
  -d '{"percentage": 100}'
```

**Monitor for 6 hours, then mark as completed**

```bash
curl -X PATCH /api/plugins/rollouts/1 \
  -d '{"status": "completed"}'
```

## Sira Integration

### Automatic Monitoring

Sira runs `auto_pause_failing_rollouts()` every 5 minutes via cron:

```bash
*/5 * * * * curl -X POST http://api/plugins/rollouts/auto-check \
  -H "Authorization: Bearer $SIRA_TOKEN"
```

### Auto-Pause Trigger

When error rate exceeds threshold:

1. Rollout status → `paused`
2. Entry logged in `plugin_rollback_history` with `sira_triggered = TRUE`
3. Ops team alerted via PagerDuty
4. Dashboard shows "Auto-Paused" status

### Manual Investigation

```sql
-- Find Sira-triggered pauses
SELECT *
FROM plugin_rollback_history
WHERE sira_triggered = TRUE
ORDER BY created_at DESC;

-- Check current error rate
SELECT
  r.id,
  r.plugin_name,
  r.version,
  get_rollout_error_rate(r.id) as current_error_rate,
  r.error_threshold
FROM plugin_rollouts r
WHERE r.status = 'paused';
```

## Test Scenarios (115ter)

### Scenario 1: Random 10% Rollout

```javascript
// Create rollout
const rollout = await createRollout({
  plugin: 'woocommerce',
  version: '4.0.0',
  percentage: 10,
  strategy: 'random'
});

// Test 100 merchants
const selected = testMerchantSelection(100);
// Expect: ~10 merchants selected (7-13 due to randomness)
```

### Scenario 2: Geo-Targeted 50% Rollout

```javascript
// Create rollout for US and FR only
const rollout = await createRollout({
  plugin: 'prestashop',
  version: '1.8.0',
  percentage: 50,
  strategy: 'geo',
  target_countries: ['US', 'FR']
});

// Test
testMerchant('us-merchant-001', 'US'); // ~50% chance
testMerchant('cn-merchant-001', 'CN'); // Always excluded
```

### Scenario 3: Sira Auto-Pause on High Error Rate

```javascript
// Create rollout with 3% threshold
const rollout = await createRollout({
  plugin: 'shopify',
  version: '2.5.0',
  percentage: 20,
  error_threshold: 0.03
});

// Simulate 50 upgrades, 5 failed (10% error rate)
simulateUpgrades({ total: 50, failed: 5 });

// Sira cron runs
await siraCronJob();

// Rollout is auto-paused
const status = await getRolloutStatus(rollout.id);
// status === 'paused'
// sira_triggered === true
```

## Deployment (115ter)

### 1. Run Migration

```bash
psql -d molam -f brique-115bis/migrations/002_progressive_rollout.sql
```

### 2. Deploy PHP Classes

```bash
# Copy rollout class
cp brique-115bis/plugins/woocommerce/class-molam-form-rollout.php \
   /var/www/html/wp-content/plugins/molam-form/includes/

# Include in main plugin file
# molam-form.php:
require_once __DIR__ . '/includes/class-molam-form-rollout.php';
```

### 3. Deploy React UI

```bash
# Build rollout control component
cd brique-115bis/src/components
npm run build

# Serve dashboard
# server.js:
app.use('/ops/rollout-control', express.static('brique-115bis/dist'));
```

### 4. Setup Sira Cron Job

```bash
# Add to crontab
*/5 * * * * curl -X POST https://api.molam.com/plugins/rollouts/auto-check \
  -H "Authorization: Bearer $SIRA_SERVICE_TOKEN"
```

## Monitoring & Alerts (115ter)

### Key Metrics

- **Active Rollouts**: Number of currently active progressive rollouts
- **Average Error Rate**: Across all active rollouts
- **Auto-Paused Count (24h)**: Number of Sira-triggered pauses
- **Rollout Velocity**: Time from 5% to 100% (target: < 7 days)

### Alert Rules

```yaml
# Prometheus Alert
- alert: HighRolloutErrorRate
  expr: |
    rollout_error_rate > rollout_error_threshold
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Rollout error rate exceeds threshold"

- alert: RolloutStuckAtLowPercentage
  expr: |
    (rollout_percentage < 20) AND (time() - rollout_created_at > 86400)
  labels:
    severity: info
  annotations:
    summary: "Rollout stuck at low percentage for >24h"
```

## Future Enhancements

- [ ] Blue-green deployment support
- [ ] Incremental backups (reduce backup size)
- [ ] Multi-datacenter backup replication
- [ ] Rollback simulation mode (dry-run)
- [ ] Automatic performance comparison (before/after upgrade)
- [ ] Rollback approval workflow for high-value merchants
- [ ] Multi-stage rollout templates (5% → 25% → 100%)
- [ ] Rollout scheduling (deploy during low-traffic hours)
- [ ] Merchant notification system (pre-upgrade warnings)

## License

MIT License - Molam Engineering

## Support

- GitHub Issues: https://github.com/molam/brique-115bis/issues
- Slack: #ops-plugins
- Email: ops@molam.com
