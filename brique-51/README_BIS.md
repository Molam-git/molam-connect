# Brique 51bis - Merchant Refund Policies & Zones

Enhancement to Brique 51 adding comprehensive policy management and zone support for refunds.

## Overview

Brique 51bis extends the refunds engine with:
- **Hierarchical Policy Management**: Global → Zone → Merchant → Sub-account
- **Zone Management**: Regional groupings for merchant coverage
- **Multi-Store Support**: Sub-accounts for merchants with multiple stores
- **SIRA Risk Scoring**: ML-based fraud detection for refund requests
- **Automated Decision Making**: Auto-approve, merchant approve, or ops approval based on policy
- **Audit Trail**: Immutable history of all policy changes and refund actions

## Architecture

```
Refund Request → Policy Resolution → SIRA Scoring → Decision
                  (Hierarchy)           (ML)         (Auto/Manual)
                       ↓                  ↓               ↓
           Sub-account → Merchant → Zone → Global
                       ↓                  ↓               ↓
                  Apply Policy → Log Action → Webhook
```

## Database Schema (7 New Tables)

1. **zones** - Regional zones (CEDEAO, EU, US, ASEAN)
2. **zone_countries** - Country to zone mapping
3. **merchant_sub_accounts** - Multi-store support for merchants
4. **refund_policies_v2** - Hierarchical policies with versioning
5. **refund_policy_history** - Immutable audit trail of policy changes
6. **refund_requests** - Customer-initiated refund requests
7. **refund_actions** - Immutable audit trail of refund actions

## Policy Hierarchy

Policies are resolved in order of specificity:

1. **Sub-account Policy** (highest priority) - Specific to a merchant's store
2. **Merchant Policy** - Applies to all sub-accounts of a merchant
3. **Zone Policy** - Applies to all merchants in a geographic zone
4. **Global Policy** (lowest priority) - Default for all merchants

## Policy Configuration

```json
{
  "reverse_window_minutes": 30,
  "max_refund_amount_absolute": 5000,
  "max_refund_amount_percent": 100,
  "auto_approve": false,
  "require_ops_approval_above": 1000,
  "chargeback_handling": "merchant",
  "allowed_methods": ["wallet", "card", "bank"],
  "ttl_for_customer_request_days": 30,
  "sira_threshold_auto_approve": 0.3
}
```

## API Endpoints

### Policies

- `GET /api/policies` - List policies (filtered by scope)
- `GET /api/policies/:id` - Get policy by ID
- `POST /api/policies` - Create policy
- `PUT /api/policies/:id` - Update policy
- `GET /api/policies/:id/history` - Get policy change history

### Zones

- `GET /api/zones` - List all zones
- `GET /api/zones/:code` - Get zone by code
- `GET /api/zones/country/:iso2` - Get zone for country
- `GET /api/zones/:id/countries` - Get countries in zone
- `POST /api/zones` - Create zone (Ops only)
- `POST /api/zones/:id/countries` - Add country to zone (Ops only)
- `GET /api/merchant/:id/zones` - Get merchant supported zones
- `GET /api/merchant/:id/supports/:country` - Check if merchant supports country

### Refund Requests

- `POST /api/refund-requests` - Create refund request (idempotent)
- `GET /api/refund-requests/:id` - Get refund request by ID
- `GET /api/refund-requests` - List refund requests
- `POST /api/refund-requests/:id/merchant-approve` - Merchant approval
- `POST /api/refund-requests/:id/ops-approve` - Ops approval
- `POST /api/refund-requests/:id/deny` - Deny refund request
- `GET /api/refund-requests/:id/actions` - Get audit trail

## Decision Flow

```
Customer Request
      ↓
Find Applicable Policy (Hierarchy)
      ↓
Check Amount Limits
      ↓
Get SIRA Score
      ↓
Apply Decision Rules:
  - SIRA > threshold → Require Ops
  - Amount > ops_threshold → Require Ops
  - Amount > merchant_threshold → Require Merchant
  - auto_approve = true → Auto Approve
  - Default → Require Merchant
      ↓
Log Decision & Update Status
```

## SIRA Integration

Risk scoring thresholds:

- **Score < 0.3**: Auto-approve (if policy allows)
- **Score 0.3-0.7**: Warning, merchant review
- **Score > 0.7**: Block auto-approve, require ops approval

## Migration

```bash
# Apply migration
psql -U molam -d molam_refunds -f migrations/bis/051bis_policies_zones.sql
```

## Seeded Data

### Zones

- **GLOBAL**: Worldwide coverage
- **CEDEAO**: West African Economic Community (15 countries)
- **EU**: European Union (14 countries seeded)
- **US**: United States
- **ASEAN**: Association of Southeast Asian Nations

### Default Policy

- Scope: Global
- Auto-approve: Disabled
- Max refund: $5,000
- Ops approval above: $1,000
- SIRA threshold: 0.3

## RBAC

### Ops Roles (finance_ops, pay_admin)

- Create/edit any policy
- Create/manage zones
- Approve any refund request
- View all audit trails

### Merchant Roles (merchant_admin)

- Create/edit merchant and sub-account policies
- Approve refund requests for their merchant
- View their own audit trails

### Customer Roles (user)

- Create refund requests
- View own refund requests

## UI Components

### Ops Policy Editor

Apple-inspired interface for creating and editing policies:
- Scope selector (Global, Zone, Merchant, Sub-account)
- Configuration fields (amounts, thresholds, SIRA)
- Visual feedback
- Version history

### Merchant Refunds Dashboard

Clean interface for merchants to manage refund requests:
- Filter tabs (Pending, Auto-Approved, Approved, Denied, All)
- SIRA score visualization
- One-click approve/deny
- Real-time status updates

## Example Flows

### Auto-Approve Flow

1. Customer creates refund request
2. System finds applicable policy
3. SIRA scores request (low risk: 0.15)
4. Policy allows auto-approve
5. Amount < threshold
6. Status: auto_approved
7. Webhook sent
8. Refund processed

### Manual Approval Flow

1. Customer creates refund request
2. System finds applicable policy
3. SIRA scores request (medium risk: 0.5)
4. Amount > merchant threshold
5. Status: requested
6. Merchant receives notification
7. Merchant approves
8. Refund processed

### Ops Escalation Flow

1. Customer creates refund request
2. System finds applicable policy
3. SIRA scores request (high risk: 0.8)
4. Score > SIRA threshold
5. Status: requested
6. Escalated to ops
7. Ops reviews and approves
8. Refund processed

## Testing

Test coverage includes:

- Policy hierarchy resolution
- SIRA integration
- Idempotency
- Authorization (RBAC)
- Decision rules
- Audit trail

## Monitoring

New metrics:

- `refund_requests_total` - Total refund requests by decision
- `refund_auto_approved_total` - Auto-approved requests
- `refund_escalated_ops_total` - Escalated to ops
- `policy_eval_latency` - Policy evaluation time
- `sira_score_distribution` - SIRA score histogram

## Security

- JWT authentication via Molam ID
- RBAC enforcement
- Idempotency keys
- Immutable audit logs
- Policy versioning
- Change history

## Rollout Plan

1. Apply database migrations
2. Seed zones and default policy
3. Deploy API in read-only mode (48h monitoring)
4. Enable policy evaluation (log-only, no auto-approve)
5. Enable auto-approve for low-risk merchants (feature flag)
6. Gradual rollout to all merchants
7. Train ops team
8. Enable SIRA dynamic overrides

## Support

Contact: treasury-ops@molam.com
