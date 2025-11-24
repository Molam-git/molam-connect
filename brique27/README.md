# Brique 27 - Notifications transactionnelles

Service de notifications transactionnelles pour Molam.

## Architecture

- **Backend**: Node.js/TypeScript avec Express
- **Base de données**: PostgreSQL
- **Message broker**: Kafka
- **Frontend**: Next.js (React) avec Tailwind CSS

## Développement

### Prérequis

- Node.js 18+
- PostgreSQL
- Kafka

### Installation

1. Cloner le dépôt
2. Installer les dépendances: `npm install`
3. Copier `.env.example` vers `.env` et configurer
4. Lancer les migrations: `npm run migrate`
5. Lancer les seeds: `psql -d molam -f database/seeds/notification_templates_seed.sql`
6. Démarrer le service: `npm run dev`

## API

### Préférences utilisateur

- `GET /api/notifications/prefs` - Lire les préférences
- `PUT /api/notifications/prefs` - Mettre à jour les préférences

### Test et monitoring (Ops)

- `POST /api/notifications/test` - Tester le rendu des templates
- `POST /api/notifications/dispatch` - Forcer l'envoi d'une notification
- `GET /api/notifications/outbox` - Monitoring de l'outbox

### Administration du routing

- `GET /api/admin/routing` - Lister les règles de routage
- `PUT /api/admin/routing` - Créer/mettre à jour une règle
- `DELETE /api/admin/routing` - Supprimer une règle

## Déploiement

Utiliser Docker Compose:

```bash
docker-compose up -d