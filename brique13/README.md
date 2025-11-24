# Brique 13 - API Historique des Transactions

API d'historique des transactions multi-pays, multi-devise, multi-rôle pour Molam Pay.

## 🚀 Fonctionnalités

- Historique unifié pour clients, marchands, agents et équipes internes
- Filtres puissants : dates, montant, statut, type, devise, pays, canal
- Pagination performante (keyset)
- Export CSV/PDF signé avec hash d'intégrité
- Sécurité RBAC/ABAC
- Observabilité complète

## 📊 Endpoints

- `GET /api/pay/history/me` - Historique client
- `GET /api/pay/history/merchant` - Historique marchand  
- `GET /api/pay/history/admin` - Historique admin
- `GET /api/pay/history/export` - Export CSV/PDF

## 🗄️ Base de données

Exécuter les scripts SQL dans l'ordre :

1. `sql/01_indexes.sql`
2. `sql/02_tables.sql` 
3. `sql/03_views.sql`
4. `sql/04_audit_tables.sql`

## 🔧 Installation

```bash
npm install
npm run build
npm start