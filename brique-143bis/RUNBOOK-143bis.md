# Runbook — Brique 143bis: AI Adaptive UI (SIRA)

## 📘 Vue d'ensemble

Système d'UI adaptatif piloté par SIRA qui ajuste automatiquement l'interface utilisateur en fonction des préférences, comportements et contextes détectés. Transversal à toute la Super App Molam (Pay, Talk, Shop, Eats, Ads, Free).

## 🔑 Fonctionnalités clés

- **Adaptation comportementale**: Analyse clics ratés, abandons de formulaire, vitesse de frappe
- **Détection de contexte**: Luminosité ambiante, qualité réseau, niveau batterie
- **Recommandations SIRA**: IA génère suggestions d'amélioration UI avec confidence score
- **Cross-module sync**: Préférences appliquées automatiquement sur tous modules Molam
- **Offline-first**: Profils en localStorage pour fonctionnement hors ligne

## 📊 Architecture

```
┌──────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│  User Behavior   │─────>│  SIRA Analytics │─────>│  Recommendations │
│  (Interactions)  │      │   (ML Engine)   │      │   (Pending)      │
└──────────────────┘      └─────────────────┘      └──────────────────┘
         │                                                    │
         │                                                    ▼
         ▼                                           ┌──────────────────┐
┌──────────────────┐                                │  User Approves/  │
│  Interaction     │                                │   Dismisses      │
│  Tracker (JS)    │                                └──────────────────┘
└──────────────────┘                                         │
         │                                                    ▼
         ▼                                           ┌──────────────────┐
┌──────────────────┐                                │  Adaptive        │
│  Context         │─────────────────────────────>│  Profile         │
│  Detection       │                                │  (Molam ID)      │
└──────────────────┘                                └──────────────────┘
                                                             │
                                                             ▼
                         ┌────────────────────────────────────────────┐
                         │  Applied across all Molam modules          │
                         │  (Pay, Talk, Shop, Eats, Ads, Free)        │
                         └────────────────────────────────────────────┘
```

## 🚀 Démarrage rapide

### 1. Déployer la base de données

```bash
psql -U molam -d molam_id -f database/migrations/143bis_adaptive_ui.sql
```

### 2. Intégrer dans votre app

```typescript
// App.tsx (Molam Pay, Shop, etc.)
import { AdaptiveUIProvider } from './AdaptiveUIProvider';
import { initializeTracker } from './utils/interactionTracker';

function App() {
  const user = useAuth(); // Get user from auth

  // Initialize interaction tracker
  useEffect(() => {
    if (user) {
      initializeTracker({
        userId: user.id,
        module: 'pay', // or 'shop', 'talk', 'eats', etc.
      });
    }
  }, [user]);

  return (
    <AdaptiveUIProvider userId={user?.id}>
      <YourApp />
    </AdaptiveUIProvider>
  );
}
```

### 3. Utiliser les adaptations

```typescript
import { useAdaptiveUIContext } from './AdaptiveUIProvider';

function CheckoutPage() {
  const { profile } = useAdaptiveUIContext();

  return (
    <div
      style={{
        fontSize: `${profile?.font_scale || 1}em`,
        backgroundColor: profile?.high_contrast ? '#000' : '#fff',
        color: profile?.high_contrast ? '#fff' : '#000',
      }}
    >
      {profile?.prefers_minimal_ui ? <MinimalCheckout /> : <FullCheckout />}
    </div>
  );
}
```

### 4. Afficher les recommandations

```typescript
import { AdaptiveRecommendationBanner } from './AdaptiveUIProvider';

function Dashboard() {
  return (
    <div>
      <AdaptiveRecommendationBanner />
      {/* Rest of your content */}
    </div>
  );
}
```

## 🤖 Comment SIRA génère les recommandations

### Métriques analysées

| Métrique | Seuil | Recommandation |
|----------|-------|----------------|
| Taux de clics ratés > 15% | `missed_click_rate > 0.15` | `enable_large_buttons` |
| Taux d'abandon formulaire > 30% | `form_abandon_rate > 0.30` | `simplify_forms` |
| Vitesse de frappe < 100 cpm | `typing_speed < 100` | `enable_auto_complete` |
| Temps d'interaction > 5s | `avg_interaction_time > 5000ms` | `enable_minimal_ui` |

### Contextes détectés

| Contexte | Conditions | Ajustements |
|----------|------------|-------------|
| `low_bandwidth` | 2G/3G, < 500 kbps | UI minimaliste, désactiver animations |
| `bright_light` | Luminosité > 80%, lux > 10000 | High contrast, augmenter taille police |
| `dark_environment` | Luminosité < 20%, 20h-6h | Dark mode, réduire luminosité |

## 📝 API Endpoints

### GET /api/sira/adaptive
Récupérer le profil adaptatif de l'utilisateur

```bash
curl -X GET http://api.molam.com/api/sira/adaptive \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "user_id": "user123",
  "lang": "fr",
  "high_contrast": false,
  "font_scale": 1.0,
  "prefers_minimal_ui": false,
  "prefers_auto_complete": true,
  "prefers_large_buttons": false,
  "prefers_simplified_forms": false,
  "detected_context": "standard",
  "sira_confidence": 0.85
}
```

### PATCH /api/sira/adaptive
Mettre à jour le profil

```bash
curl -X PATCH http://api.molam.com/api/sira/adaptive \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "font_scale": 1.2,
    "high_contrast": true
  }'
```

### POST /api/sira/adaptive/events
Enregistrer un événement d'interaction

```bash
curl -X POST http://api.molam.com/api/sira/adaptive/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_abc123",
    "event_type": "missed_click",
    "component": "PayButton",
    "module": "pay",
    "page_url": "/checkout",
    "target_element": "DIV",
    "intended_element": "BUTTON"
  }'
```

### GET /api/sira/adaptive/recommendations
Récupérer les recommandations en attente

```bash
curl -X GET http://api.molam.com/api/sira/adaptive/recommendations \
  -H "Authorization: Bearer $TOKEN"

# Response:
[
  {
    "id": "rec_123",
    "recommendation_type": "enable_large_buttons",
    "reason": "High missed click rate detected",
    "confidence": 0.92,
    "supporting_data": {
      "missed_click_rate": 0.18,
      "missed_clicks": 25,
      "total_interactions": 140
    },
    "status": "pending",
    "created_at": "2025-01-18T10:00:00Z"
  }
]
```

### POST /api/sira/adaptive/recommendations/:id/apply
Appliquer une recommandation

```bash
curl -X POST http://api.molam.com/api/sira/adaptive/recommendations/rec_123/apply \
  -H "Authorization: Bearer $TOKEN"
```

### POST /api/sira/adaptive/analyze
Déclencher l'analyse SIRA

```bash
curl -X POST http://api.molam.com/api/sira/adaptive/analyze \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "ok": true,
  "recommendations_count": 2,
  "recommendations": [...]
}
```

## 🔍 Événements trackés automatiquement

Le `interactionTracker.ts` enregistre automatiquement:

- **Clics**: Tous les clics + clics ratés
- **Formulaires**: Soumissions et abandons
- **Frappe**: Début/fin typing avec vitesse
- **Scroll**: Profondeur de scroll
- **Resize**: Changements de taille fenêtre
- **Orientation**: Changements portrait/paysage

## 📈 Monitoring

### Utilisateurs avec taux de clics ratés élevé

```sql
SELECT user_id, missed_click_rate, avg_interaction_time
FROM adaptive_profiles
WHERE missed_click_rate > 0.15
ORDER BY missed_click_rate DESC
LIMIT 10;
```

### Recommandations les plus fréquentes

```sql
SELECT recommendation_type, COUNT(*) as count, AVG(confidence) as avg_confidence
FROM sira_ui_recommendations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY recommendation_type
ORDER BY count DESC;
```

### Taux d'acceptation des recommandations

```sql
SELECT
  recommendation_type,
  COUNT(*) FILTER (WHERE status = 'applied') as applied,
  COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'applied') / COUNT(*), 2) as acceptance_rate
FROM sira_ui_recommendations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY recommendation_type;
```

### Métriques d'interaction par module

```sql
SELECT
  module,
  COUNT(*) as total_events,
  SUM(CASE WHEN event_type = 'missed_click' THEN 1 ELSE 0 END) as missed_clicks,
  SUM(CASE WHEN event_type = 'form_abandon' THEN 1 ELSE 0 END) as form_abandons
FROM ui_interaction_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY module
ORDER BY total_events DESC;
```

## 🔧 Dépannage

### Recommandations non générées

```bash
# Vérifier que le worker d'analyse tourne
curl -X POST http://api.molam.com/api/sira/adaptive/analyze \
  -H "Authorization: Bearer $TOKEN"

# Vérifier les métriques
SELECT * FROM adaptive_profiles WHERE user_id = 'USER_ID';
```

### Événements non enregistrés

```sql
-- Vérifier les derniers événements
SELECT * FROM ui_interaction_events
WHERE user_id = 'USER_ID'
ORDER BY created_at DESC
LIMIT 20;

-- Vérifier si le tracker est initialisé
-- Dans la console du navigateur:
console.log(window.molamTracker);
```

### Contexte non détecté

```sql
-- Vérifier les contextes détectés
SELECT user_id, detected_context, last_context_update
FROM adaptive_profiles
WHERE user_id = 'USER_ID';

-- Forcer une détection
curl -X POST http://api.molam.com/api/sira/adaptive/context \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connection_type": "2g",
    "ambient_light": "bright",
    "battery_level": 15
  }'
```

## 🎨 CSS Classes appliquées

```css
/* Classes appliquées automatiquement au <html> */

.adaptive-high-contrast {
  --bg: #000;
  --text: #fff;
  --primary: #00f;
}

.adaptive-minimal-ui {
  /* Hide non-essential elements */
}

.adaptive-minimal-ui .sidebar,
.adaptive-minimal-ui .promo-banner {
  display: none !important;
}

.adaptive-large-buttons button {
  min-height: 48px !important;
  min-width: 120px !important;
  padding: 12px 24px !important;
}
```

## ✅ Best Practices

1. **Initialiser le tracker**: Toujours appeler `initializeTracker()` au mount de l'app
2. **Wrapper avec Provider**: Envelopper votre app avec `<AdaptiveUIProvider>`
3. **Data attributes**: Ajouter `data-component="ComponentName"` aux éléments clés
4. **Respecter les préférences**: Ne pas override les adaptations utilisateur
5. **Tester**: Vérifier tous modules appliquent bien les mêmes adaptations

## 📊 KPIs

- **Taux d'adoption SIRA**: > 40% utilisateurs avec au moins 1 adaptation
- **Acceptance rate recommendations**: > 60%
- **Réduction clics ratés**: > 30% après activation large buttons
- **Réduction abandons formulaires**: > 25% après simplification
- **Cross-module consistency**: 100% profils synchro

## 🔐 Sécurité

- Toutes les données anonymisées pour analytics
- Pas de PII dans `ui_interaction_events`
- Consentement utilisateur requis pour tracking
- Opt-out disponible via `/api/sira/adaptive` (DELETE)

## ✅ Checklist quotidienne

- [ ] Check recommandations en attente
- [ ] Review taux d'acceptation par type
- [ ] Verify cross-module sync (Pay ↔ Shop ↔ Talk)
- [ ] Check performance impact tracker (<50ms/event)
- [ ] Review false positives (clics ratés sur scroll zones)

## 📞 Support

- **Slack**: #sira-adaptive-ui
- **Docs**: https://docs.molam.com/sira-adaptive
- **Dashboard**: https://ops.molam.com/sira/adaptive

---

**Dernière mise à jour**: 2025-01-18
