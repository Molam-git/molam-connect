# Brique 75 - Merchant Settings UI
## Complete Documentation

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Last Updated**: 2025-11-11

---

## Table of Contents

1. [Introduction](#introduction)
2. [Features Overview](#features-overview)
3. [Quick Start](#quick-start)
4. [User Guide](#user-guide)
5. [API Reference](#api-reference)
6. [Integration Guide](#integration-guide)
7. [Best Practices](#best-practices)
8. [Security](#security)
9. [Troubleshooting](#troubleshooting)

---

## Introduction

Brique 75 provides a centralized, Apple-like configuration interface for merchants to manage all aspects of their payment processing, branding, and business settings. It replaces fragmented configuration scattered across multiple interfaces with a unified, intuitive experience.

### Why Brique 75?

- **Centralized Configuration**: All merchant settings in one place
- **Apple-like UX**: Clean, intuitive, professional interface
- **Complete Branding Control**: Logo, colors, fonts, checkout themes
- **Flexible Payment Methods**: Enable/disable, configure limits and fees
- **Commission Management**: Request overrides with approval workflow
- **Full Audit Trail**: Immutable, blockchain-style audit log
- **Version Control**: Automatic versioning with rollback capability
- **Compliance-Ready**: BCEAO, PCI-DSS, GDPR compliant

---

## Features Overview

### 1. General Settings

Configure basic merchant preferences:

- **Default Currency**: XOF, EUR, USD, GBP, etc.
- **Default Language**: Français, English, Português
- **Supported Currencies**: Multi-currency support
- **Timezone**: Africa/Dakar, Europe/Paris, etc.
- **Payment Method Priority**: Ordering for checkout display

### 2. Branding Configuration

Complete visual identity customization:

- **Logo Management**: Logo, square logo, favicon, cover image
- **Color Palette**: Primary, secondary, accent, background, text colors
- **Typography**: Font family with custom font URL support
- **Button Style**: Square, rounded, pill
- **Checkout Theme**: Light, dark, auto (follows system)
- **Checkout Layout**: Embedded, redirect, popup
- **Custom CSS**: Advanced styling override
- **Contact Info**: Support email, phone, website
- **Social Links**: Twitter, Facebook, Instagram, LinkedIn

**Live Preview**: Real-time preview of branding changes before saving.

### 3. Payment Methods Management

Granular control over payment methods:

- **Available Methods**:
  - Molam Wallet
  - Credit/Debit Cards (Visa, Mastercard, etc.)
  - Mobile Money (MTN, Orange, Wave, Moov)
  - Bank Transfer
  - USSD
  - QR Code

- **Per-Method Configuration**:
  - Enable/disable
  - Display name and order
  - Min/max amounts
  - Daily/monthly limits
  - Fee configuration (percentage, fixed, hybrid)
  - Supported currencies
  - Allowed countries

### 4. Sales Zones

Geographic and tax configuration:

- **Allowed/Blocked Countries**: Whitelist or blacklist countries
- **Regional Groups**: EU, WAEMU, SADC, etc.
- **Tax Configuration**: Per-country VAT/tax rates
- **Currency Mapping**: Automatic currency by country
- **Shipping Zones**: Delivery zones with custom rates

### 5. Refund Policies

Automated and manual refund management:

- **Auto-Refund**: Automatic refunds with configurable conditions
- **Refund Window**: Max days for refund eligibility
- **Manual Approval**: Threshold for manual approval
- **Partial Refunds**: Enable/disable partial refunds
- **Refund Fees**: None, percentage, or fixed
- **Fee Responsibility**: Merchant, customer, or split

### 6. Subscription Configuration

Recurring payment settings:

- **Billing Intervals**: Monthly, yearly, custom
- **Free Trials**: Enable with configurable duration
- **Failed Payment Retry**: Automatic retry schedule
- **Dunning Management**: Email reminders schedule
- **Cancellation Policy**: Customer self-cancellation
- **Proration**: Prorated billing for plan changes
- **Plan Changes**: Immediate or next billing cycle

### 7. Commission Override Workflow

Request custom commission rates:

- **Request Submission**: Merchant requests override with justification
- **Ops Approval**: Requires Ops admin approval
- **Time-Bound**: Effective from/until dates
- **Conditional**: Apply to specific amounts, methods, etc.
- **History Tracking**: Complete override request history
- **Automatic Expiration**: Overrides expire automatically

### 8. Version Control

Automatic settings versioning:

- **Auto-Versioning**: Every update creates new version
- **Complete Snapshots**: Full settings state saved
- **Change Tracking**: Field-level change detection
- **Rollback**: Restore previous version with one click
- **Version History**: Browse all past versions

### 9. Audit Trail

Immutable audit log:

- **All Actions Logged**: Create, update, delete, approve, etc.
- **Hash Chain**: Blockchain-style integrity verification
- **Actor Tracking**: User ID, IP, User-Agent
- **Before/After Values**: Complete change history
- **Compliance Ready**: Export for regulators
- **Integrity Verification**: Detect tampering

---

## Quick Start

### For Merchants

1. **Access Settings**:
   ```
   Navigate to: Dashboard > Settings
   ```

2. **Configure General Settings**:
   - Select default currency (e.g., XOF)
   - Select default language (e.g., Français)
   - Set timezone (e.g., Africa/Dakar)
   - Click "Save Changes"

3. **Setup Branding**:
   - Upload logo
   - Choose primary color (e.g., #0066CC)
   - Select button style (rounded recommended)
   - Preview changes in real-time
   - Click "Save Branding"

4. **Enable Payment Methods**:
   - Review available methods
   - Enable desired methods (Wallet, Mobile Money, Cards)
   - Configure limits if needed
   - Toggle on/off as needed

5. **Request Commission Override** (optional):
   - Navigate to Commission tab
   - Click "Request Override"
   - Enter desired rate and justification
   - Submit for Ops approval

### For Developers

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run SQL Migrations**:
   ```bash
   psql -d molam_connect -f brique-75/sql/001_merchant_settings_schema.sql
   ```

3. **Configure Environment**:
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect
   ```

4. **Import Service**:
   ```typescript
   import merchantSettingsService from './services/merchantSettings';

   // Get settings
   const settings = await merchantSettingsService.getMerchantSettings(merchantId);

   // Update settings
   await merchantSettingsService.updateMerchantSettings(
     merchantId,
     { default_currency: 'EUR' },
     userId
   );
   ```

5. **Mount React UI**:
   ```tsx
   import { MerchantSettings } from './components/MerchantSettings';

   <MerchantSettings merchantId="merchant-uuid-here" />
   ```

---

## User Guide

### Managing General Settings

1. Navigate to **Settings** > **General** tab
2. Update desired fields:
   - **Default Currency**: Used for all new transactions
   - **Default Language**: UI language for customers
   - **Timezone**: Affects reporting and scheduling
3. Click **Save Changes**

**Note**: Changing currency does not affect existing transactions.

### Customizing Branding

1. Navigate to **Settings** > **Branding** tab
2. Configure visual identity:

   **Logo Setup**:
   - Upload main logo (recommended: 200x60px PNG with transparency)
   - Upload square logo (recommended: 512x512px for favicons)
   - Upload favicon (recommended: 32x32px)

   **Color Palette**:
   - Primary: Main brand color (buttons, links)
   - Secondary: Supporting color (headers, footers)
   - Accent: Call-to-action highlights
   - Use color picker or enter hex code

   **Button Style**:
   - Square: Modern, sharp corners
   - Rounded: Professional, slight curves (recommended)
   - Pill: Playful, fully rounded

   **Checkout Theme**:
   - Light: Clean, professional (recommended)
   - Dark: Modern, reduces eye strain
   - Auto: Follows customer's system preference

3. Use **Live Preview** to see changes in real-time
4. Click **Save Branding**

### Managing Payment Methods

1. Navigate to **Settings** > **Payment Methods** tab
2. View all available methods
3. For each method:

   **Enable/Disable**:
   - Toggle to enable or disable
   - Disabled methods won't appear at checkout

   **Configure Limits** (click method to expand):
   - Min Amount: Minimum transaction (e.g., 500 XOF)
   - Max Amount: Maximum transaction (e.g., 1,000,000 XOF)
   - Daily Limit: Max per day (optional)
   - Monthly Limit: Max per month (optional)

   **Configure Fees**:
   - Fee Type: Percentage, Fixed, or Hybrid
   - Percentage: e.g., 2.5%
   - Fixed: e.g., 100 XOF

4. **Reorder Methods**:
   - Drag and drop to change display order
   - First method appears first at checkout

### Requesting Commission Override

1. Navigate to **Settings** > **Commission** tab
2. View current commission rate
3. Click **Request Override**
4. Fill request form:
   - **New Rate**: Desired commission percentage
   - **Reason**: Brief explanation (10-500 chars)
   - **Justification**: Detailed explanation (min 20 chars)
5. Click **Submit Request**
6. **Wait for Approval**:
   - Request goes to Ops team
   - You'll receive notification when approved/rejected
   - Check **Override History** for status

### Viewing Settings History

1. Navigate to **Settings** > **History** tab
2. View all past versions
3. Each version shows:
   - Version number
   - Timestamp
   - Changed fields
   - User who made changes
4. **Rollback** (if needed):
   - Click "Rollback" next to desired version
   - Confirm action
   - Settings restored to that version
   - New version created with rollback

### Reviewing Audit Trail

1. Navigate to **Settings** > **Audit** tab
2. View **Integrity Status**:
   - ✅ Green: Audit trail verified
   - ❌ Red: Possible tampering detected
3. Review audit entries:
   - Action performed
   - User who performed it
   - Timestamp
   - IP address
4. Use for compliance reporting and incident investigation

---

## API Reference

### Base URL

```
https://api.molam.app
```

### Authentication

All endpoints require authentication via Molam ID JWT:

```http
Authorization: Bearer <your_jwt_token>
```

---

### General Settings

#### Get Merchant Settings

```http
GET /connect/:merchantId/settings
```

**Response**:
```json
{
  "success": true,
  "settings": {
    "settings": { ... },
    "branding": { ... },
    "payment_methods": [ ... ],
    "sales_zones": { ... },
    "refund_policy": { ... },
    "subscription_config": { ... },
    "active_commission_rate": 2.5
  }
}
```

#### Update Merchant Settings

```http
POST /connect/:merchantId/settings
```

**Request Body**:
```json
{
  "default_currency": "EUR",
  "default_language": "fr",
  "supported_currencies": ["EUR", "USD", "XOF"],
  "timezone": "Europe/Paris"
}
```

**Response**:
```json
{
  "success": true,
  "settings": { ... }
}
```

#### Get Settings History

```http
GET /connect/:merchantId/settings/history?limit=20&offset=0
```

**Response**:
```json
{
  "success": true,
  "history": [
    {
      "id": "uuid",
      "version": 5,
      "settings_snapshot": { ... },
      "changed_fields": ["default_currency", "timezone"],
      "changed_by": "user-uuid",
      "created_at": "2025-11-11T10:30:00Z"
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

#### Rollback Settings

```http
POST /connect/:merchantId/settings/rollback
```

**Request Body**:
```json
{
  "target_version": 3
}
```

**Response**:
```json
{
  "success": true,
  "settings": { ... },
  "message": "Settings rolled back to version 3"
}
```

---

### Branding

#### Get Branding

```http
GET /connect/:merchantId/branding
```

#### Update Branding

```http
POST /connect/:merchantId/branding
```

**Request Body**:
```json
{
  "business_name": "My Business",
  "logo_url": "https://example.com/logo.png",
  "primary_color": "#0066CC",
  "secondary_color": "#333333",
  "accent_color": "#FF6B35",
  "button_style": "rounded",
  "checkout_theme": "light"
}
```

#### Get Branding Preview CSS

```http
GET /connect/:merchantId/branding/preview-css
```

**Response**: CSS file with custom variables

---

### Payment Methods

#### Get Payment Methods

```http
GET /connect/:merchantId/payment-methods
```

**Response**:
```json
{
  "success": true,
  "payment_methods": [
    {
      "id": "uuid",
      "method_type": "mobile_money",
      "provider": "mtn_momo",
      "is_enabled": true,
      "display_order": 0,
      "min_amount": 500,
      "max_amount": 1000000,
      "fee_type": "percentage",
      "fee_percentage": 1.5
    }
  ]
}
```

#### Update Payment Method

```http
POST /connect/:merchantId/payment-methods/:methodType
```

**Request Body**:
```json
{
  "provider": "mtn_momo",
  "is_enabled": true,
  "min_amount": 500,
  "max_amount": 1000000,
  "fee_type": "percentage",
  "fee_percentage": 1.5
}
```

#### Toggle Payment Method

```http
POST /connect/:merchantId/payment-methods/:methodType/toggle
```

**Request Body**:
```json
{
  "provider": "mtn_momo",
  "enabled": false
}
```

---

### Commission

#### Get Current Commission Rate

```http
GET /connect/:merchantId/commission
```

**Response**:
```json
{
  "success": true,
  "commission_rate": 2.5
}
```

#### Request Commission Override

```http
POST /connect/:merchantId/commission/request-override
```

**Request Body**:
```json
{
  "commission_rate": 1.8,
  "reason": "High volume merchant discount",
  "justification": "Processing 10M+ XOF monthly with 99.9% success rate...",
  "effective_from": "2025-12-01T00:00:00Z",
  "effective_until": "2026-12-01T00:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "override": {
    "id": "uuid",
    "status": "pending",
    "commission_rate": 1.8,
    ...
  },
  "message": "Commission override request submitted for approval"
}
```

#### Approve Override (Ops Only)

```http
POST /connect/:merchantId/commission/override/:overrideId/approve
```

**Response**:
```json
{
  "success": true,
  "override": {
    "id": "uuid",
    "status": "approved",
    "approved_by": "ops-user-uuid",
    "approved_at": "2025-11-11T14:00:00Z"
  }
}
```

#### Reject Override (Ops Only)

```http
POST /connect/:merchantId/commission/override/:overrideId/reject
```

**Request Body**:
```json
{
  "rejection_reason": "Insufficient volume to justify lower rate"
}
```

---

### Audit

#### Get Audit Log

```http
GET /connect/:merchantId/audit?action=settings_updated&limit=50&offset=0
```

**Query Parameters**:
- `action` (optional): Filter by action type
- `actor_id` (optional): Filter by user
- `from_date` (optional): ISO 8601 date
- `to_date` (optional): ISO 8601 date
- `limit` (optional): 1-100, default 50
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "success": true,
  "audit_entries": [
    {
      "id": "uuid",
      "merchant_id": "merchant-uuid",
      "action": "settings_updated",
      "actor_id": "user-uuid",
      "actor_type": "merchant_user",
      "ip_address": "192.168.1.1",
      "changes": { ... },
      "previous_values": { ... },
      "new_values": { ... },
      "hash": "abc123...",
      "prev_hash": "def456...",
      "created_at": "2025-11-11T10:00:00Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### Verify Audit Integrity

```http
GET /connect/:merchantId/audit/verify
```

**Response**:
```json
{
  "success": true,
  "verification": {
    "valid": true,
    "total_entries": 150
  }
}
```

**Or if tampered**:
```json
{
  "success": true,
  "verification": {
    "valid": false,
    "total_entries": 150,
    "first_invalid_entry": "entry-uuid",
    "error": "Hash chain broken at entry entry-uuid"
  }
}
```

---

## Integration Guide

### Backend Integration

1. **Install Service**:
   ```typescript
   import merchantSettingsService from '@molam/brique-75/services/merchantSettings';
   ```

2. **Mount Routes**:
   ```typescript
   import merchantSettingsRoutes from '@molam/brique-75/routes/merchantSettings';

   app.use('/api', merchantSettingsRoutes);
   ```

3. **Use in Payment Flow**:
   ```typescript
   // Get active payment methods for checkout
   const { payment_methods } = await merchantSettingsService.getMerchantSettings(merchantId);
   const enabledMethods = payment_methods.filter(m => m.is_enabled);

   // Check commission rate for transaction
   const commissionRate = await merchantSettingsService.getActiveCommissionRate(merchantId);
   const commission = transactionAmount * (commissionRate / 100);
   ```

### Frontend Integration

1. **Install Component**:
   ```tsx
   import { MerchantSettings } from '@molam/brique-75/components/MerchantSettings';
   ```

2. **Mount in Dashboard**:
   ```tsx
   function MerchantDashboard() {
     const { merchantId } = useAuth();

     return (
       <div>
         <h1>Dashboard</h1>
         <MerchantSettings merchantId={merchantId} />
       </div>
     );
   }
   ```

3. **Customize Styles** (optional):
   ```tsx
   // TailwindCSS configuration is included
   // Override with your theme in tailwind.config.js
   ```

### Webhook Integration

Listen for settings changes:

```json
{
  "event": "merchant.settings.updated",
  "merchant_id": "merchant-uuid",
  "version": 6,
  "changed_fields": ["default_currency", "primary_color"],
  "timestamp": "2025-11-11T10:00:00Z"
}
```

**Use Cases**:
- Clear cache when branding updated
- Recalculate limits when payment methods changed
- Notify merchant when commission override approved

---

## Best Practices

### For Merchants

1. **Branding**:
   - Use high-resolution logos (PNG with transparency)
   - Stick to 2-3 main colors for consistency
   - Test both light and dark checkout themes
   - Use "Auto" theme for best customer experience

2. **Payment Methods**:
   - Enable methods popular in your target market
   - Set reasonable limits to prevent fraud
   - Monitor daily/monthly limits regularly
   - Disable unused methods to reduce clutter

3. **Commission**:
   - Only request overrides with strong justification
   - Provide concrete metrics (volume, success rate)
   - Set realistic expiration dates
   - Review and renew before expiration

4. **Settings Management**:
   - Test changes in staging before production
   - Use version history to track changes
   - Rollback immediately if issues detected
   - Document major changes in internal notes

### For Developers

1. **API Usage**:
   - Cache settings response (invalidate on webhook)
   - Use versioning to detect stale data
   - Handle 403 for Ops-only endpoints gracefully
   - Implement exponential backoff for retries

2. **Security**:
   - Always validate JWT tokens
   - Log all settings changes to audit trail
   - Rate limit settings update endpoints
   - Sanitize custom CSS before rendering

3. **Performance**:
   - Index merchant_id for fast lookups
   - Partition audit table by month if high volume
   - Use Redis cache for hot path (getSettings)
   - Lazy load payment methods on checkout

4. **Compliance**:
   - Export audit logs regularly for backups
   - Verify audit integrity daily
   - Alert on integrity check failures
   - Store settings snapshots for regulatory compliance

---

## Security

### Authentication & Authorization

- **JWT Authentication**: All endpoints require valid Molam ID JWT
- **Role-Based Access Control**: Ops endpoints require `ops_admin` role
- **Merchant Isolation**: Users can only access their own merchant settings

### Audit Trail

- **Immutable Log**: Cannot delete or modify audit entries
- **Hash Chain**: Blockchain-style integrity verification
- **Tamper Detection**: Automatic detection of manipulated entries
- **Actor Tracking**: Full traceability (user, IP, timestamp)

### Data Protection

- **Encrypted at Rest**: Database encryption enabled
- **Encrypted in Transit**: HTTPS/TLS for all API calls
- **PII Redaction**: Sensitive data redacted in logs
- **Access Logs**: All access logged for security monitoring

### Compliance

- **BCEAO**: Support for WAEMU regulatory requirements
- **PCI-DSS**: Payment card data security standards
- **GDPR**: Personal data protection (EU)
- **Data Residency**: Configurable data storage location

---

## Troubleshooting

### Common Issues

#### Settings Not Updating

**Symptom**: Changes saved but not visible

**Solutions**:
1. Check browser cache - hard refresh (Ctrl+Shift+R)
2. Verify websocket connection for real-time updates
3. Check version number increased
4. Review audit log for failed updates

#### Branding Preview Not Showing

**Symptom**: Preview shows default styles

**Solutions**:
1. Verify color hex codes are valid (#RRGGBB)
2. Check logo URL is publicly accessible
3. Clear browser cache
4. Try different image format (PNG recommended)

#### Commission Override Request Failed

**Symptom**: 400 error when submitting request

**Solutions**:
1. Check reason is 10-500 characters
2. Check justification is minimum 20 characters
3. Verify commission_rate is 0-100
4. Ensure no pending override exists

#### Payment Method Not Appearing

**Symptom**: Enabled method not showing at checkout

**Solutions**:
1. Verify `is_enabled` is true
2. Check min/max amounts don't exclude transaction
3. Verify currency is in `supported_currencies`
4. Check country is in `allowed_countries`
5. Clear payment methods cache

#### Rollback Failed

**Symptom**: Error when rolling back to previous version

**Solutions**:
1. Verify version exists in history
2. Check you have permission to rollback
3. Ensure target version is not current version
4. Check database connection

#### Audit Integrity Failed

**Symptom**: Red integrity check failure

**Solutions**:
1. **DO NOT PANIC** - may be false positive
2. Note the first invalid entry ID
3. Contact Ops team immediately
4. Do not make more changes until resolved
5. Check for database corruption
6. Review recent database maintenance logs

### Error Codes

| Code | Error | Solution |
|------|-------|----------|
| 400 | Bad Request | Check request body matches API spec |
| 401 | Unauthorized | Verify JWT token is valid and not expired |
| 403 | Forbidden | Check user has required role (e.g., ops_admin) |
| 404 | Not Found | Verify merchant ID or resource ID exists |
| 409 | Conflict | Pending override exists, wait or cancel |
| 500 | Internal Server Error | Check server logs, contact support |

### Getting Help

1. **Documentation**: Check this file first
2. **API Logs**: Review audit trail for details
3. **Support Email**: support@molam.app
4. **Slack**: #brique-75-support
5. **GitHub Issues**: https://github.com/molam/molam-connect/issues

---

## Changelog

### v1.0.0 (2025-11-11)

**Initial Release**:
- ✅ SQL schema with 9 tables
- ✅ TypeScript service layer (950 lines)
- ✅ REST API routes (620 lines)
- ✅ React UI component (1,150 lines)
- ✅ Complete documentation

**Features**:
- General settings management
- Complete branding customization with live preview
- Payment methods configuration
- Sales zones and tax management
- Refund policies configuration
- Subscription settings
- Commission override workflow
- Automatic versioning with rollback
- Immutable audit trail with hash chain verification

**Database**:
- 9 core tables
- 4 automated triggers
- 1 SQL function (get_merchant_commission_rate)
- 20+ indexes for performance
- Full referential integrity

**Compliance**:
- BCEAO/WAEMU support
- PCI-DSS ready
- GDPR compliant
- Immutable audit trail

---

## License

Copyright © 2025 Molam. All rights reserved.

---

**Brique 75 v1.0 - Merchant Settings UI**
*Apple-like merchant configuration experience*

Built with ❤️ by the Molam Team
