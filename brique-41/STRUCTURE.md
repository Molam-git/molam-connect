# Brique 41 - Molam Connect - Structure Complète

## Vue d'ensemble

**Statut**: Architecture complète implémentée ✅
**Langage**: TypeScript + Node.js
**Base de données**: PostgreSQL
**Port par défaut**: 8041

## Structure des fichiers

```
molam-connect/ (brique-41-connect)
├── migrations/                          # Migrations SQL
│   └── 000_b41_connect_core.sql        # Schema principal (7 tables)
│
├── src/                                 # Code source TypeScript
│   ├── server.ts                        # ⚡ Point d'entrée principal
│   ├── db.ts                            # 🔌 Pool PostgreSQL + helpers
│   ├── auth.ts                          # 🔐 JWT Molam ID (RS256)
│   ├── rbac.ts                          # 👮 Contrôle d'accès (RBAC)
│   │
│   ├── routes/                          # 🛣️ Routes API REST
│   │   ├── accounts.ts                  # Comptes marchands (CRUD + capacités)
│   │   ├── externalAccounts.ts          # Comptes de payout (bank/wallet)
│   │   ├── onboarding.ts                # Tâches d'onboarding
│   │   └── webhooks.ts                  # Webhooks (HMAC-SHA256)
│   │
│   ├── services/                        # 🔧 Services métier
│   │   ├── verification.ts              # Sync vérification avec Wallet (B33)
│   │   ├── pricing.ts                   # Calcul frais & commissions
│   │   ├── treasuryClient.ts            # Client Treasury (B34-35)
│   │   ├── walletClient.ts              # Client Wallet (B33)
│   │   └── events.ts                    # Système d'événements & webhooks
│   │
│   └── utils/                           # 🛠️ Utilitaires
│       ├── idempotency.ts               # Clés d'idempotence
│       ├── validate.ts                  # Validations (email, URL, etc.)
│       └── audit.ts                     # Logs d'audit immuables
│
├── workers/                             # ⚙️ Background jobs
│   ├── verification-sync.ts             # Worker: sync vérification
│   └── events-dispatcher.ts             # Worker: dispatch webhooks
│
├── dist/                                # 📦 Code compilé (généré)
│
├── package.json                         # Dependencies & scripts
├── tsconfig.json                        # Configuration TypeScript
├── .env.example                         # Variables d'environnement
├── .gitignore                           # Git ignore rules
│
├── README.md                            # Documentation principale
├── QUICKSTART.md                        # Guide de démarrage rapide
└── STRUCTURE.md                         # Ce fichier
```

## Base de données (PostgreSQL)

### Tables créées (migrations/000_b41_connect_core.sql)

| Table | Description | Clés importantes |
|-------|-------------|------------------|
| `connect_accounts` | Comptes marchands | `owner_user_id`, `wallet_id`, `capabilities` |
| `connect_persons` | Représentants/UBOs | `connect_account_id`, `linked_wallet_id` |
| `connect_external_accounts` | Comptes de payout | `connect_account_id`, `type` (bank/wallet) |
| `connect_onboarding_tasks` | Tâches d'onboarding | `connect_account_id`, `status` |
| `connect_fee_profiles` | Profils de frais | `connect_account_id`, `fees` (JSONB) |
| `connect_webhooks` | Endpoints webhooks | `connect_account_id`, `secret` (HMAC) |
| `connect_audit_logs` | Logs d'audit | `connect_account_id`, `action`, `actor` |

## API Endpoints

### Comptes marchands (`/api/connect/accounts`)

| Méthode | Endpoint | Description | Rôles requis |
|---------|----------|-------------|--------------|
| POST | `/` | Créer compte | merchant_admin, pay_admin |
| GET | `/` | Lister comptes | merchant_admin, pay_admin |
| GET | `/:id` | Détails compte | merchant_admin, pay_admin |
| PATCH | `/:id` | Modifier compte | merchant_admin, pay_admin |
| POST | `/:id/capabilities` | Activer capacités | pay_admin, compliance_ops |
| POST | `/:id/fee_profile` | Définir frais | pay_admin, compliance_ops |
| POST | `/:id/refresh_verification` | Sync vérification | merchant_admin, pay_admin |
| POST | `/:id/approve` | Approuver compte | compliance_ops |
| POST | `/:id/reject` | Rejeter compte | compliance_ops |

### Comptes externes (`/api/connect/accounts/:id/external_accounts`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/` | Ajouter compte payout |
| GET | `/` | Lister comptes |
| GET | `/:externalId` | Détails compte |
| PATCH | `/:externalId` | Modifier compte |
| DELETE | `/:externalId` | Supprimer compte |

### Onboarding (`/api/connect/accounts/:id/onboarding`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/tasks` | Lister tâches |
| POST | `/tasks` | Créer tâche (Ops) |
| GET | `/tasks/:taskId` | Détails tâche |
| PATCH | `/tasks/:taskId` | Modifier tâche (Ops) |
| POST | `/tasks/:taskId/resolve` | Résoudre tâche (Ops) |
| DELETE | `/tasks/:taskId` | Supprimer tâche (Ops) |
| GET | `/status` | Statut onboarding |

### Webhooks (`/api/connect/accounts/:id/webhooks`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/` | Créer webhook |
| GET | `/` | Lister webhooks |
| GET | `/:webhookId` | Détails webhook |
| PATCH | `/:webhookId` | Modifier webhook |
| DELETE | `/:webhookId` | Supprimer webhook |
| POST | `/:webhookId/rotate_secret` | Rotation secret |
| POST | `/:webhookId/test` | Tester webhook |

## Rôles & Permissions (RBAC)

| Rôle | Description | Accès |
|------|-------------|-------|
| `merchant_admin` | Admin marchand | Son compte uniquement |
| `merchant_finance` | Finance marchand | Son compte (lecture finance) |
| `connect_platform` | Plateforme/marketplace | Sous-comptes |
| `pay_admin` | Admin Molam Pay | Tous les comptes |
| `compliance_ops` | Opérations compliance | Tous les comptes + approbations |

## Intégrations avec autres briques

### Wallet (Brique 33)
- **Service**: `src/services/walletClient.ts`
- **Fonctions**:
  - Récupération info wallet
  - Vérification status KYC
  - Transferts internes
  - Vérification des fonds

### Treasury (Briques 34-35)
- **Service**: `src/services/treasuryClient.ts`
- **Fonctions**:
  - Création payouts
  - Statut payouts
  - Annulation payouts
  - Consultation soldes

## Workers (Background Jobs)

### 1. Verification Sync (`workers/verification-sync.ts`)

**Fréquence recommandée**: Toutes les heures
**Rôle**: Synchronise le statut de vérification avec Wallet (B33)

```bash
npm run worker:verification
```

**Cron**:
```cron
0 * * * * cd /path/to/molam-connect && npm run worker:verification
```

### 2. Events Dispatcher (`workers/events-dispatcher.ts`)

**Fréquence recommandée**: Toutes les 5 minutes
**Rôle**: Dispatch les webhooks basés sur les audit logs

```bash
npm run worker:events
```

**Cron**:
```cron
*/5 * * * * cd /path/to/molam-connect && npm run worker:events
```

## Scripts NPM

| Script | Commande | Description |
|--------|----------|-------------|
| `dev` | `npm run dev` | Mode développement (ts-node) |
| `build` | `npm run build` | Compilation TypeScript |
| `start` | `npm start` | Démarrage production |
| `migrate` | `npm run migrate` | Exécuter migrations SQL |
| `worker:verification` | `npm run worker:verification` | Sync vérification |
| `worker:events` | `npm run worker:events` | Dispatch webhooks |

## Variables d'environnement

### Essentielles
- `DATABASE_URL` - Connexion PostgreSQL
- `MOLAM_ID_JWT_PUBLIC` - Clé publique JWT (RS256)
- `PORT` - Port serveur (défaut: 8041)

### Intégrations
- `WALLET_URL` - URL service Wallet (B33)
- `TREASURY_URL` - URL service Treasury (B34-35)

### Sécurité
- `NODE_ENV` - Environnement (development/production)
- `CORS_ORIGIN` - Origine CORS autorisée

Voir [.env.example](.env.example) pour la liste complète.

## Sécurité & Compliance

### Authentification
- JWT RS256 (Molam ID)
- Bearer tokens
- Validation signature

### RBAC
- 5 rôles distincts
- Scope par propriétaire
- Vérification capacités

### Audit
- Logs immuables
- Traçabilité complète
- Actions horodatées

### Webhooks
- Signatures HMAC-SHA256
- Secrets rotatifs
- Header `X-Molam-Signature`

### Rate Limiting
- 600 req/min par IP
- Configurable

## Développement

### Lancement local

1. **Installer les dépendances**:
   ```bash
   npm install
   ```

2. **Configurer .env**:
   ```bash
   cp .env.example .env
   # Éditer .env
   ```

3. **Créer la base de données**:
   ```bash
   createdb molam_connect
   npm run migrate
   ```

4. **Démarrer le serveur**:
   ```bash
   npm run dev
   ```

### Test de l'API

```bash
# Health check
curl http://localhost:8041/healthz

# Créer un compte (JWT requis)
curl -X POST http://localhost:8041/api/connect/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_id": "uuid-wallet",
    "business_type": "company",
    "display_name": "Ma Société",
    "country": "SN",
    "default_currency": "XOF"
  }'
```

## Déploiement

### Structure recommandée (écosystème)

```
molam-ecosystem/
├── brique-01-xxx/
├── brique-33-wallet/
├── brique-34-treasury/
├── brique-35-treasury-ops/
├── brique-41-connect/        # Ce projet
└── ...
```

### Checklist déploiement

- [ ] PostgreSQL configuré et sécurisé
- [ ] Variables d'environnement définies
- [ ] Migrations exécutées
- [ ] Services Wallet & Treasury accessibles
- [ ] Clé publique JWT configurée
- [ ] Workers schedulés (cron)
- [ ] Monitoring configuré
- [ ] Backups BDD automatiques
- [ ] SSL/TLS activé
- [ ] Rate limiting adapté

## Prochaines étapes

### Fonctionnalités à implémenter

- [ ] Payment Intents (création & traitement)
- [ ] Charges (confirmations paiements)
- [ ] Refunds (remboursements)
- [ ] Disputes (litiges)
- [ ] Payouts automatiques
- [ ] Plugins e-commerce (WooCommerce, Shopify)
- [ ] SDK JavaScript/React (Molam Form)
- [ ] Dashboard marchand (UI)
- [ ] Rapports & analytics
- [ ] Tests unitaires & intégration

### Améliorations

- [ ] Cache Redis (sessions, rate limiting)
- [ ] Queue (RabbitMQ/Kafka) pour webhooks
- [ ] Retry automatique webhooks
- [ ] Monitoring (Sentry, DataDog)
- [ ] Logs structurés (Winston/Bunyan)
- [ ] Documentation OpenAPI/Swagger
- [ ] CI/CD pipeline
- [ ] Load balancing
- [ ] Auto-scaling

## Support

- **Documentation**: [README.md](README.md)
- **Quick Start**: [QUICKSTART.md](QUICKSTART.md)
- **Issues**: https://github.com/Molam-git/molam-connect/issues

---

**Version**: 1.0.0
**Date**: November 2024
**Statut**: Production-ready (core features)
