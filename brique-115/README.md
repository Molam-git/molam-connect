# Brique 115: Versioning & Migration Strategy for Plugin (Backwards Compat)

**Système de versioning, compatibilité arrière, et migrations automatiques pour tous les plugins Molam Form.**

## 📋 Vue d'ensemble

Brique 115 garantit que les plugins Molam Form sont :

- ✅ **Versionnés proprement** : Chaque release identifiée, traçable, documentée
- ✅ **Backwards compatible** : Anciennes versions continuent à fonctionner
- ✅ **Migrables sans friction** : Auto-update avec migrations automatiques
- ✅ **Interopérables** : Vérification compatibilité plugin ↔ API ↔ Molam ID
- ✅ **Auditées** : Toutes migrations loggées (RBAC + audit)
- ✅ **Pilotées par Ops** : Désactiver versions vulnérables, forcer upgrade, délai de grâce

## 🏗️ Architecture

```
brique-115/
├── migrations/
│   └── 001_plugin_versioning_migration.sql  # 5 tables + fonctions + vues
├── src/
│   ├── server.ts                             # Serveur Express (port 8115)
│   ├── routes/
│   │   └── plugins.ts                       # API routes (registry, logs)
│   ├── services/
│   │   ├── versionService.ts                # Version checking, compatibility
│   │   └── upgradeService.ts                # Upgrade logging
│   └── utils/
│       ├── rbac.ts                          # RBAC
│       └── audit.ts                        # Audit logging
├── examples/
│   └── woocommerce/
│       ├── class-molam-upgrade.php          # Auto-upgrade class
│       └── manifest.json                    # Plugin manifest
├── web/
│   └── src/
│       └── PluginRegistryDashboard.tsx      # Ops dashboard
└── tests/
    └── plugins.test.ts                      # Unit tests
```

## 🗄️ Schéma de Base de Données

### Tables principales

1. **plugin_versions** - Registry centralisé
   - name, version, api_min_version, api_max_version
   - checksum, status, backwards_compatible, migration_required
   - security_advisory, grace_period_days

2. **plugin_upgrade_logs** - Historique upgrades
   - merchant_id, plugin_name, from_version, to_version
   - status, details (JSONB), migrations_applied
   - duration_ms, error_message

3. **plugin_compatibility** - Matrice de compatibilité
   - plugin_name, plugin_version, api_version
   - compatible, notes, tested_at

4. **plugin_migration_scripts** - Registry scripts migration
   - from_version, to_version, script_type, script_content
   - idempotent, rollback_script

5. **plugin_versioning_policy** - Configuration globale (single row)
   - auto_update_enabled, whitelist, grace periods

### Vues utiles

- `plugin_version_stats` - Versions avec statistiques
- `merchant_plugin_versions` - Versions installées par marchand

## 🚀 Installation

### 1. Prérequis

- Node.js 18+
- PostgreSQL 12+

### 2. Installation

```bash
cd brique-115
npm install
```

### 3. Configuration

```env
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect
MOLAM_ID_JWT_PUBLIC=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
PORT=8115
LOG_LEVEL=info
```

### 4. Migrations

```bash
npm run migrate
```

### 5. Démarrer

```bash
npm run dev
```

## 📡 API Endpoints

### Public (pour plugins)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/plugins/registry/:name` | List versions disponibles |
| GET | `/api/plugins/registry/:name/latest` | Get latest version |
| GET | `/api/plugins/check-update/:name` | Check if update available |
| POST | `/api/plugins/logs` | Log upgrade (after upgrade) |

### Ops (authentifié)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/plugins/registry/:name/all` | All versions (incl. deprecated) | ops_plugins |
| POST | `/api/plugins/registry` | Register new version | ops_plugins |
| POST | `/api/plugins/registry/:name/:version/status` | Update status | ops_plugins |
| GET | `/api/plugins/upgrade-logs` | Get upgrade logs | ops_plugins |
| GET | `/api/plugins/stats` | Versioning statistics | ops_plugins |

## 💻 Exemples d'utilisation

### Plugin check for updates

```php
// WooCommerce plugin
$response = wp_remote_get(
    'https://api.molam.com/api/plugins/check-update/woocommerce',
    array(
        'body' => array(
            'current_version' => '1.0.0',
            'api_version' => '2025-01'
        )
    )
);

$data = json_decode(wp_remote_retrieve_body($response), true);
if ($data['update_available']) {
    // Perform upgrade
    $upgrade->perform_upgrade($data['latest_version']);
}
```

### Register new version (Ops)

```bash
curl -X POST http://localhost:8115/api/plugins/registry \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "woocommerce",
    "version": "1.3.0",
    "api_min_version": "2025-01",
    "api_max_version": "2026-01",
    "checksum": "sha256-abc123...",
    "release_notes": "Bug fixes and performance improvements",
    "backwards_compatible": true,
    "migration_required": false
  }'
```

### Deprecate version (Ops)

```bash
curl -X POST http://localhost:8115/api/plugins/registry/woocommerce/1.0.0/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "deprecated",
    "reason": "Security update available"
  }'
```

## 🔄 Flux Auto-Upgrade

### 1. Plugin Startup

```
Plugin démarre
  → Lit manifest.json (version, api_min_version, api_max_version)
  → Contacte registry: GET /api/plugins/check-update/:name
  → Vérifie compatibilité avec API actuelle
```

### 2. Update Available

```
Registry retourne:
  {
    "update_available": true,
    "latest_version": "1.2.3",
    "compatible": true,
    "migrations_required": ["1.1.0", "1.2.0"]
  }
```

### 3. Auto-Upgrade (si activé)

```
1. Download new version (verify checksum)
2. Create backup
3. Apply migrations (idempotent)
4. Install new version
5. Log upgrade: POST /api/plugins/logs
6. Update local version
```

### 4. Rollback (si échec)

```
1. Restore from backup
2. Log rollback: POST /api/plugins/logs (status: "rollback")
3. Notify merchant/Ops
```

## 🎨 Interface Ops

Le composant `PluginRegistryDashboard.tsx` fournit :

- ✅ Liste des versions par plugin
- ✅ Statut (active/deprecated/blocked)
- ✅ Statistiques upgrades (success/failed/rollback)
- ✅ Upgrade logs récents
- ✅ Actions : Update status, view details

## 📝 Manifest.json Standard

Tous les plugins incluent un `manifest.json` :

```json
{
  "name": "woocommerce",
  "version": "1.2.3",
  "api_min_version": "2025-01",
  "api_max_version": "2026-01",
  "checksum": "sha256-...",
  "build_date": "2025-01-18T00:00:00Z",
  "migrations": [...]
}
```

## 🔄 Migrations

### Types de migrations

- **SQL** : ALTER TABLE, CREATE TABLE, etc.
- **PHP/JavaScript/Python** : Scripts de migration
- **Config** : Mise à jour options/settings

### Idempotence

Toutes les migrations sont idempotentes (peuvent être exécutées plusieurs fois).

### Exemple migration

```php
// Migration 1.1.0: Add fx_rate column
if (version_compare($from_version, '1.1.0', '<')) {
    $wpdb->query("ALTER TABLE molam_orders ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(18,6)");
}
```

## 🧪 Tests

```bash
npm test
```

### Tests couverts

- ✅ List versions
- ✅ Check for updates
- ✅ Log upgrade
- ✅ Update version status
- ✅ Version comparison
- ✅ Compatibility checking

## 🔐 Sécurité

- ✅ **Checksum verification** : SHA-256 pour intégrité packages
- ✅ **RBAC** : Seuls ops_plugins/pay_admin peuvent modifier registry
- ✅ **Audit trail** : Toutes actions loggées
- ✅ **Backup before upgrade** : Rollback possible
- ✅ **Grace periods** : Délai avant forced upgrade

## 🔗 Intégrations

### Services requis

- **Molam API** : Registry endpoints
- **Plugin Registry** : Centralized version storage
- **Merchant Plugins** : Heartbeat avec version info

### Briques liées

- **Brique 111** : Merchant Config UI (plugin management)
- **Brique 111-1** : Self-Healing (auto-update integration)
- **Brique 110** : Plugin Telemetry (version tracking)

## 📄 License

ISC

## 👥 Contact

Molam Team - [GitHub](https://github.com/Molam-git)

---

**Status**: ✅ Complete - Ready for production deployment  
**Version**: 1.0.0  
**Dependencies**: PostgreSQL 12+, Node.js 18+

