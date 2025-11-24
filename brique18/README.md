# Brique 18 - API Agents (Cash-In / Cash-Out)

## Objectifs
- Permettre à un agent partenaire de réaliser des opérations de cash-in et cash-out
- Gérer multi-pays, multi-langues, multi-devises
- Sécurité mTLS + JWT avec idempotency et rate-limiting

## Fonctionnalités
- Cash-In Self (gratuit)
- Cash-In Other (payant - émetteur paie)
- Cash-Out (gratuit pour bénéficiaire)

## Installation
1. Exécuter les migrations SQL dans l'ordre
2. Installer les dépendances: `npm install`
3. Démarrer le service: `npm run dev`

## Sécurité
- mTLS obligatoire pour tous les endpoints
- JWT avec scopes appropriés
- Rate limiting par agent
- Idempotency keys pour éviter les doublons