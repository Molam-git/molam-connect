# Brique 11 - Rewards & Refund Reconciliation Engine

Moteur industriel de gestion des récompenses (cashback/points/vouchers) avec reconciliation automatique des remboursements.

## Fonctionnalités

- Gestion complète cashback/points/vouchers
- Clawback automatique sur annulation/remboursement
- Multi-pays, multi-devise, multi-langue
- Compatible Wave-like (Ma) et Stripe-like (Connect)
- Intégration SIRA (anti-abus, scoring fidélité)
- Ledger double-entrée complet
- USSD support (*131#)

## Installation

1. Cloner le repository
2. `npm install`
3. `docker-compose up -d`
4. `npm run dev`

## API Endpoints

### Utilisateurs
- `GET /api/pay/rewards/me` - Liste des récompenses
- `POST /api/pay/rewards/claim` - Conversion manuelle

### Administration
- `POST /api/pay/rewards/admin/rules` - Créer règles
- `PATCH /api/pay/rewards/admin/rules/:id/toggle` - Activer/désactiver

### Webhooks
- `POST /api/internal/webhooks/tx` - Événements transactions

## Structure SQL

Voir `sql/init.sql` pour le schéma complet avec:
- Tables: règles, récompenses, ledger, créances
- Indexes optimisés
- Vues d'audit
- Types enumerés