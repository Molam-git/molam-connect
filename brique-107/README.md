# Brique 107 — Offline Fallback: QR Dynamique + USSD Multi-Pays

**Production-Ready Offline Payment Solutions**

Multi-channel offline payment support through dynamic QR codes and USSD menus.

---

## 🎯 Objectif

Permettre aux utilisateurs et agents d'effectuer des paiements **sans connexion internet** via:
1. **QR Dynamique** - Codes QR sécurisés (HMAC) avec expiration
2. **USSD Multi-pays** - Menus *131# pour solde, transfert, recharge, retrait

---

## 📦 Features

### 1. QR Dynamique 📱

- **Génération QR sécurisée** : HMAC-SHA256 signature
- **Types supportés** : Payment requests, cash-in, agent receipts, withdrawals
- **Expiration automatique** : TTL configurable (défaut: 5min)
- **Formats multiples** : PNG Data URL, SVG, URL
- **Protection replay** : Usage unique + vérification HMAC
- **Multi-device** : Scan depuis mobile ou terminal agent

**Use Cases:**
- Client scanne QR du marchand → paiement
- Agent génère QR → client scanne → cash-in
- Marchand affiche QR → agent valide → cash-out

### 2. USSD Multi-Pays ☎️

- **Menu principal** : *131# (unique code)
- **Sous-menus** :
  - `*1311#` - Solde
  - `*1312#` - Recharger
  - `*1313#` - Transfert
  - `*1314#` - Retrait
  - `*13199#` - Reset PIN
- **Multi-pays** : SN, CI, ML, BF, TG, BJ (configurable)
- **Multi-langues** : FR, EN, WO (Wolof), plus...
- **Sécurité** : PIN 4 chiffres + verrouillage après 3 tentatives
- **FSM** : Finite State Machine pour gestion sessions
- **Session timeout** : 5min inactivité

**Workflow Transfer:**
```
*131# → Menu
  3 → Transfert
    → PIN? ****
      → Destinataire? +221771234567
        → Montant? 5000
          → Confirmer? 1=Oui
            → ✅ Transfert effectué!
```

### 3. Agent Operations 👤

- **Cash-in** : Agent → Client (via QR ou USSD)
- **Cash-out** : Client → Agent (withdrawal)
- **Float management** : Suivi solde agent
- **Commission** : Calcul automatique
- **KYC** : Vérification limites agent

---

## 🗄️ Database Schema

### Tables créées

| Table | Description |
|-------|-------------|
| `qr_sessions` | QR codes dynamiques |
| `ussd_sessions` | Sessions USSD avec FSM |
| `ussd_menu_texts` | Textes multilingues |
| `ussd_transactions` | Historique transactions |
| `agent_operations` | Opérations agents |
| `ussd_pins` | PINs USSD (Argon2) |
| `offline_metrics` | Métriques offline |

---

## 🔌 API Endpoints

### QR Code APIs

#### Create QR Code
```http
POST /api/v1/qr/create
Content-Type: application/json

{
  "merchant_id": "uuid",
  "type": "payment_request",
  "amount": 5000,
  "currency": "XOF",
  "ttl": 300
}
```

**Response:**
```json
{
  "id": "qr_xxx",
  "url": "http://localhost:3000/qr/pay/qr_xxx?h=abc123...",
  "qr_data_url": "data:image/png;base64,...",
  "qr_svg": "<svg>...</svg>",
  "hmac": "abc123...",
  "expires_at": "2025-11-17T20:00:00Z"
}
```

#### Verify QR Code
```http
GET /api/v1/qr/verify/:id?hmac=abc123
```

**Response:**
```json
{
  "id": "qr_xxx",
  "type": "payment_request",
  "amount": 5000,
  "currency": "XOF",
  "status": "pending",
  "expires_at": "2025-11-17T20:00:00Z"
}
```

#### Complete QR Payment
```http
POST /api/v1/qr/:id/complete
Content-Type: application/json

{
  "payment_method": "card",
  "card_last4": "4242"
}
```

#### List QR Sessions
```http
GET /api/v1/qr/sessions?merchant_id=uuid&status=pending&limit=20
```

---

### USSD APIs

#### Handle USSD Request
```http
POST /api/v1/ussd/callback
Content-Type: application/json

{
  "sessionId": "ATUid_abc123",
  "msisdn": "+221771234567",
  "text": "1*3*+221776543210*5000",
  "countryCode": "SN"
}
```

**Response:**
```json
{
  "text": "Confirmer transfert de 5000 XOF vers +221776543210?\n1. Oui\n2. Non",
  "end": false
}
```

#### Get USSD Session
```http
GET /api/v1/ussd/sessions/:sessionId
```

#### List USSD Transactions
```http
GET /api/v1/ussd/transactions?phone=+221771234567&limit=20
```

---

## 🧪 Testing

### Test QR Code Flow

**1. Create QR:**
```bash
curl -X POST http://localhost:3000/api/v1/qr/create \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_request",
    "amount": 5000,
    "currency": "XOF"
  }'
```

**2. Scan QR (get ID and HMAC from response):**
```bash
curl http://localhost:3000/api/v1/qr/verify/QR_ID?hmac=HMAC_VALUE
```

**3. Complete payment:**
```bash
curl -X POST http://localhost:3000/api/v1/qr/QR_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"payment_method": "card"}'
```

### Test USSD Flow

**1. Main menu:**
```bash
curl -X POST http://localhost:3000/api/v1/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_session_1",
    "msisdn": "+221771234567",
    "text": "",
    "countryCode": "SN"
  }'
```

**2. Check balance (option 1):**
```bash
curl -X POST http://localhost:3000/api/v1/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_session_1",
    "msisdn": "+221771234567",
    "text": "1",
    "countryCode": "SN"
  }'
```

**3. Enter PIN:**
```bash
curl -X POST http://localhost:3000/api/v1/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_session_1",
    "msisdn": "+221771234567",
    "text": "1*1234",
    "countryCode": "SN"
  }'
```

---

## 🔐 Security

### QR Code Security
- **HMAC-SHA256** : Signature pour éviter falsification
- **Expiration** : TTL automatique (5min par défaut)
- **Single-use** : QR utilisé une seule fois
- **Idempotency** : Protection contre replay

### USSD Security
- **PIN Management** : Argon2 hashing (production)
- **Rate Limiting** : 3 tentatives max
- **Account Lock** : 30min après échec
- **Session Timeout** : 5min inactivité
- **OTP Fallback** : Pour montants élevés

---

## 🌍 Multi-Pays Configuration

### Countries Supported

| Country | Code | Default Language | Currency |
|---------|------|-----------------|----------|
| Sénégal | SN | FR | XOF |
| Côte d'Ivoire | CI | FR | XOF |
| Mali | ML | FR | XOF |
| Burkina Faso | BF | FR | XOF |
| Togo | TG | FR | XOF |
| Bénin | BJ | FR | XOF |

### Adding New Country

```sql
INSERT INTO ussd_menu_texts (country_code, language, menu_key, text_content) VALUES
('CI', 'fr', 'main_menu', 'Bienvenue sur Molam CI\n1. Solde\n2. Recharger\n3. Transfert\n4. Retrait\n99. Reset PIN');
```

---

## 📊 Metrics & Monitoring

### Metrics Collected

- `qr_generated` - QR codes créés
- `qr_scanned` - QR scannés
- `qr_completed` - Paiements QR complétés
- `ussd_session` - Sessions USSD
- `ussd_transaction` - Transactions USSD
- `agent_operation` - Opérations agents

### Query Metrics

```sql
SELECT metric_type, country_code, COUNT(*), SUM(value)
FROM offline_metrics
WHERE recorded_at >= now() - interval '7 days'
GROUP BY metric_type, country_code;
```

---

## 🛠️ Configuration

### Environment Variables

```env
# QR Configuration
QR_HMAC_SECRET=your-secret-key-change-me
PAY_URL=https://pay.molam.com

# USSD Configuration
USSD_MAX_PIN_ATTEMPTS=3
USSD_PIN_LOCK_DURATION=30
USSD_SESSION_TIMEOUT=300
```

---

## 🚀 Production Deployment

### 1. USSD Gateway Integration

**Providers:**
- Africa's Talking (Kenya, Nigeria, Uganda)
- Hubtel (Ghana)
- Orange (West Africa)
- MTN (Multi-country)

**Webhook Configuration:**
```
POST https://api.molam.com/v1/ussd/callback
```

### 2. QR Secret Rotation

```bash
# Generate new HMAC secret
openssl rand -hex 32

# Update environment
export QR_HMAC_SECRET=new_secret

# Restart server
pm2 restart molam-connect
```

### 3. Database Indexes

Déjà créés dans la migration:
- QR sessions : merchant_id, status, expires_at
- USSD sessions : session_id, phone, country_code
- Metrics : metric_type, recorded_at

---

## 📚 Integration Examples

### Web SDK - Display QR Code

```javascript
const response = await fetch('/api/v1/qr/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'payment_request',
    amount: 5000,
    currency: 'XOF'
  })
});

const { qr_data_url, expires_at } = await response.json();

// Display QR code
document.getElementById('qr-code').src = qr_data_url;
```

### Mobile App - Scan QR

```javascript
// Scan QR code (using camera)
const qrData = await scanQRCode();

// Parse URL
const url = new URL(qrData);
const qrId = url.pathname.split('/').pop();
const hmac = url.searchParams.get('h');

// Verify QR
const response = await fetch(`/api/v1/qr/verify/${qrId}?hmac=${hmac}`);
const qrInfo = await response.json();

// Proceed with payment
```

---

## 🧩 Architecture

```
┌─────────────┐
│   Client    │
│ (App/Agent) │
└──────┬──────┘
       │ Scan QR / Dial *131#
       ↓
┌─────────────────┐
│  Molam Connect  │
│   API Server    │
├─────────────────┤
│  QR Service     │
│  USSD Service   │
└──────┬──────────┘
       ↓
┌──────────────────┐
│   PostgreSQL     │
│ (qr_sessions,    │
│  ussd_sessions)  │
└──────────────────┘
```

---

## ✅ Checklist

- [x] Database schema créé
- [x] QR Service implémenté
- [x] USSD FSM implémenté
- [x] API endpoints
- [x] Multi-pays support
- [x] Security (HMAC, PIN)
- [x] Metrics collection
- [ ] Agent app integration
- [ ] USSD gateway integration
- [ ] Production deployment

---

**Made with ❤️ by Molam Team**
