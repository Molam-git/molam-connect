# Brique 15 - Notifications Transactionnelles

Service de notifications multi-langues et multi-canaux pour Molam Pay.

## Fonctionnalités

- Notifications en temps réel pour événements financiers
- Support multi-langues (EN, FR, Wolof, Arabe)
- Canaux multiples: In-App, Push, SMS, Email, USSD
- Gestion fine des préférences utilisateur
- Intégration Sira pour prioritisation et anti-spam
- Architecture industrielle avec idempotence, DLQ, retries

## Démarrage

1. Installer les dépendances: `npm install`
2. Configurer les variables d'environnement
3. Exécuter les migrations SQL
4. Lancer le service: `npm run dev`

## API

- `GET /api/notify/preferences` - Obtenir les préférences
- `PUT /api/notify/preferences` - Modifier les préférences
- `POST /internal/notify/test` - Endpoint de test interne