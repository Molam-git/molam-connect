# Brique 25 - API Banques Partenaires

Service d'interopérabilité avec les banques partenaires pour Molam Pay.

## Fonctionnalités

- Transferts IN (banque → wallet)
- Transferts OUT (wallet → banque) 
- Gestion des partenaires bancaires
- Système de frais (bank_fee + molam_fee)
- Webhooks pour les statuts
- Réconciliation automatique
- Sécurité renforcée (mTLS, HMAC, Idempotency)

## Installation

1. Cloner le repository
2. Copier `.env.example` vers `.env`
3. Configurer les variables d'environnement
4. `npm install`
5. `npm run build`
6. `docker-compose up -d`

## API Endpoints

- `POST /api/bank/deposits` - Dépôts bancaires
- `POST /api/bank/payouts` - Retraits bancaires  
- `POST /api/banks/webhooks/:partnerCode` - Webhooks partenaires
- `POST /api/banks/partners` - Administration partenaires

## Sécurité

- JWT Molam ID avec RS256
- mTLS pour les communications inter-services
- HMAC pour les webhooks
- Idempotency-Key obligatoire
- Anti-replay avec nonce Redis
- Rate limiting