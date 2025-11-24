# Brique 22 - API Banques partenaires

Permet dépôts/retraits via banques partenaires avec sélection automatique de route bancaire et application de frais.

## Fonctionnalités

- Sélection automatique de route (SIRA: coût/latence/taux succès)
- Double couche de frais: banque + Molam
- Transparence UX avec breakdown des frais
- Ledger double-entrée et traçabilité
- Webhooks sécurisés

## API Endpoints

- `GET /api/pay/banks/routes` - Obtenir les routes disponibles
- `POST /api/pay/banks/execute` - Exécuter une opération
- `POST /api/pay/banks/webhook/:bankCode` - Webhook bancaire

## Sécurité

- JWT avec scopes: `wallet:bank:deposit`, `wallet:bank:withdraw`
- mTLS entre services
- HMAC pour les webhooks
- Rate limiting: 10 req/min/UID