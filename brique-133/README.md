# Brique 133 — Unified Molam Pay Dashboard

## Overview
Unified entry point for Molam Pay Super App with intelligent routing, personalization, and SIRA-powered auto-redirect based on user behavior.

## Features
- **Universal Access**: Mobile (iOS, Android, HarmonyOS), Desktop (Windows, macOS, Linux), Web/PWA
- **Apple-like Design**: Minimalist circular buttons, blur effects, Molam ID colors
- **Smart Routing**: SIRA learns usage patterns and auto-redirects to preferred module
- **Personalization**: User preferences stored per Molam ID
- **Module Management**: Enable/disable modules on-demand
- **Multi-Module Support**: Wallet, Connect, Eats, Shop, Talk, Ads
- **A/B Testing**: Invisible experiments to optimize user experience
- **Analytics**: Track module usage for engagement insights

## Super App Architecture

**Molam Pay is part of the Molam Super App:**
- 💳 **Molam Ma (Wallet)** - Personal payments, P2P, cash-in/out
- 🏪 **Molam Connect** - Merchant payments, marketplaces, enterprises
- 🍔 **Molam Eats** - Food delivery
- 🛍️ **Molam Shop** - E-commerce marketplace
- 💬 **Molam Talk** - Messaging & social
- 📢 **Molam Ads** - Advertising platform

**Entry Point Logic:**
1. User opens Molam Pay
2. Check preferences: auto_redirect enabled?
3. If yes → Navigate directly to preferred module
4. If no → Show 2 main buttons (Wallet, Connect) + other modules

## Database Tables

### user_pay_entry_preferences
User-specific module preferences
- `user_id` - Molam ID (unique)
- `preferred_module` - User's favorite module
- `last_module_used` - Last accessed module
- `modules_enabled` - JSONB array of enabled modules
- `auto_redirect` - Enable automatic routing
- `redirect_target` - Target module for auto-redirect
- `device_type` - mobile, desktop, web
- `locale` - User language (fr, en, etc.)

### pay_module_usage
Analytics for SIRA learning
- `user_id` - User identifier
- `module` - Accessed module
- `session_duration` - Time spent (seconds)
- `device_type` / `platform` - Device info
- `accessed_at` - Timestamp

### module_activation_requests
Gated module activation requests
- `user_id` - Requesting user
- `module` - Module to activate
- `status` - pending, approved, rejected
- `reason` - User justification

### sira_module_recommendations
AI-driven module suggestions
- `user_id` - Target user
- `recommended_module` - Suggested module
- `confidence_score` - 0-1 confidence level
- `reason` - Why this module
- `accepted` - User response

### pay_entry_experiments
A/B testing tracking
- `experiment_name` - Experiment identifier
- `variant` - control, auto_redirect, smart_suggestions
- `user_id` - User in experiment
- `outcome` - Metrics (JSONB)

## API Endpoints

### GET /api/pay/entry
Get user pay entry configuration

**Response:**
```json
{
  "user_id": "molam-123",
  "preferred_module": "wallet",
  "last_module_used": "wallet",
  "modules_enabled": ["wallet", "connect", "eats"],
  "auto_redirect": true,
  "redirect_target": "wallet",
  "locale": "fr"
}
```

### PUT /api/pay/entry
Update user preferences

```json
{
  "preferred_module": "connect",
  "auto_redirect": false,
  "locale": "en"
}
```

### POST /api/pay/track
Track module access

```json
{
  "module": "wallet",
  "session_duration": 300,
  "device_type": "mobile",
  "platform": "ios"
}
```

### POST /api/pay/modules/:module/enable
Enable a module for user

### POST /api/pay/modules/:module/request
Request activation for gated module

### GET /api/pay/stats
Get module usage statistics (last 30 days)

**Response:**
```json
[
  {
    "module": "wallet",
    "usage_count": 45,
    "avg_duration": 280.5,
    "last_accessed": "2025-01-18T10:00:00Z"
  },
  {
    "module": "connect",
    "usage_count": 5,
    "avg_duration": 120.0,
    "last_accessed": "2025-01-15T14:00:00Z"
  }
]
```

### POST /api/pay/sira/recommend
Apply SIRA recommendation to preferences

**Response:**
```json
{
  "auto_redirect": true,
  "redirect_target": "wallet",
  "recommended_modules": ["wallet"]
}
```

## SIRA Learning Algorithm

**Auto-Redirect Criteria:**
- User uses single module >80% of time
- Minimum 10 sessions in last 30 days
- Consistent access pattern (no recent switches)

**Recommendation Logic:**
```typescript
const totalUsage = stats.reduce((sum, s) => sum + s.usage_count, 0);
const topModule = stats[0];
const topModulePercent = topModule.usage_count / totalUsage;

if (topModulePercent > 0.8 && stats.length === 1) {
  return {
    auto_redirect: true,
    redirect_target: topModule.module,
  };
}
```

**Learning Feedback Loop:**
1. Track every module access
2. Compute usage statistics weekly
3. Update auto_redirect preferences
4. Log recommendation in sira_module_recommendations
5. Monitor acceptance rate

## Mobile Implementation (React Native)

**Key Features:**
- Circular module buttons with gradients
- Auto-redirect with loading screen
- Enable additional modules inline
- Native feel with smooth animations

**Navigation:**
```typescript
function navigateToModule(module: string) {
  const routes = {
    wallet: "WalletHome",
    connect: "ConnectDashboard",
    eats: "EatsHome",
    // ...
  };
  navigation.navigate(routes[module]);
}
```

**Styling:**
- LinearGradient backgrounds
- Circular buttons (width: 40% screen width)
- Elevation & shadows for depth
- Tailwind-inspired spacing

## Web Implementation (React/PWA)

**Key Features:**
- Responsive grid layout
- Large circular buttons (256px)
- Hover effects with scale transform
- Settings access
- PWA installable

**Responsive Design:**
- Desktop: Side-by-side main modules
- Mobile: Stacked layout
- Grid for additional modules (2 cols mobile, 4 cols desktop)

**Navigation:**
```typescript
function navigateToModule(module: string) {
  const routes = {
    wallet: "/wallet",
    connect: "/connect",
    // ...
  };
  navigate(routes[module]);
}
```

## UX Principles

**Simplicity > Complexity:**
- Maximum 2 primary actions (Wallet, Connect)
- Additional modules in secondary grid
- One-tap activation for new modules

**Accessibility:**
- Works for MIT engineer in Boston
- Works for vendor in Kaolack market
- Universal language support (fr, en, wo, ar, etc.)

**Visual Hierarchy:**
1. Main modules: Large, circular, gradient
2. Additional modules: Smaller, grid layout
3. Settings: Footer link

**Performance:**
- <300ms API response for /api/pay/entry
- <100ms auto-redirect decision
- Prefetch module assets on idle

## A/B Testing

**Experiment Variants:**
- **control** - Standard 2-button entry
- **auto_redirect** - SIRA-powered auto-routing
- **smart_suggestions** - AI module recommendations

**Metrics Tracked:**
- Retention (7-day, 30-day)
- Module engagement (sessions per week)
- Time to first action
- Module switching frequency

**Implementation:**
```typescript
// Assign user to variant on first visit
const variant = Math.random() < 0.5 ? "control" : "auto_redirect";

await pool.query(
  `INSERT INTO pay_entry_experiments(experiment_name, variant, user_id)
   VALUES ('auto_redirect_test', $1, $2)`,
  [variant, userId]
);
```

## Analytics

**Tracked Events:**
- `pay_entry_viewed` - Entry screen loaded
- `module_clicked` - Module button tapped
- `module_enabled` - New module activated
- `auto_redirect_triggered` - SIRA redirect executed

**Analytics Platform Integration:**
- Google Analytics (Web)
- Firebase Analytics (Mobile)
- Custom events to data warehouse

## Security & Privacy

**RBAC:**
- Molam ID authentication required
- User can only access own preferences
- Module activation may require approval (gated modules)

**Data Privacy:**
- Usage tracking anonymized for aggregates
- Personal preferences encrypted at rest
- GDPR-compliant data retention (2 years)

**Rate Limiting:**
- 100 requests/hour per user for /api/pay/entry
- 10 module activations per day

## Multi-Platform Support

**Mobile (React Native):**
- Expo for cross-platform
- Platform.OS detection
- Native navigation
- Push notifications for module recommendations

**Desktop (Electron):**
- Windows, macOS, Linux
- Menu bar integration
- Deep linking to modules
- Auto-update

**Web (PWA):**
- Installable on all platforms
- Offline support
- Service worker caching
- Add to homescreen

## Internationalization

**Supported Languages:**
- French (fr)
- English (en)
- Wolof (wo)
- Arabic (ar)
- Portuguese (pt)

**Translation Keys:**
```json
{
  "pay_entry.title": {
    "fr": "Bienvenue sur Molam Pay",
    "en": "Welcome to Molam Pay"
  },
  "pay_entry.subtitle": {
    "fr": "Choisissez votre module préféré",
    "en": "Choose your preferred module"
  }
}
```

## Monitoring & Observability

**Prometheus Metrics:**
- `molam_pay_entry_views_total` - Total entry screen views
- `molam_pay_auto_redirects_total` - Auto-redirect count
- `molam_pay_module_activations_total{module}` - New activations
- `molam_pay_api_latency_seconds` - API response times

**SLOs:**
- Entry screen load time P95 <500ms
- API /api/pay/entry P95 <300ms
- Auto-redirect decision P99 <100ms

**Alerting:**
- Entry screen errors >1% → PagerDuty
- Auto-redirect failures >5% → Ops notification
- API latency P95 >1s → Alert

## Rollout Strategy

**Phase 1 - Pilot (Week 1-2):**
- Deploy to 5% of users
- Monitor engagement and errors
- A/B test auto-redirect vs control

**Phase 2 - Gradual Rollout (Week 3-4):**
- Increase to 25% of users
- Analyze SIRA recommendation acceptance
- Optimize UX based on feedback

**Phase 3 - Full Launch (Week 5+):**
- 100% rollout
- Enable auto-redirect for eligible users
- Monitor long-term retention impact

## Integration Points
- **Molam ID (B1)** - Authentication and user profiles
- **Molam Wallet (Ma)** - Personal wallet module
- **Molam Connect** - Merchant payments module
- **SIRA** - Usage pattern learning and recommendations
- **Analytics Platform** - Event tracking and reporting
- **Notification Engine** - Module suggestions and updates

## Future Enhancements

**Smart Home Screen:**
- Contextual module suggestions (time, location)
- Quick actions (recent payouts, favorite merchants)
- Balance preview without full navigation

**Voice Navigation:**
- "Open Molam Wallet"
- "Enable Molam Eats"

**Widget Support:**
- iOS/Android home screen widgets
- macOS menu bar widget
- Windows taskbar integration

## Version
**1.0.0** | Status: ✅ Ready for Production
