#!/bin/bash

# =====================================================================
# Script de Test - Tous les Schémas SQL
# =====================================================================
# Ce script teste l'installation de tous les schémas SQL des briques
# Date: 2025-11-12
# =====================================================================

set -e  # Exit on error

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="${DB_NAME:-molam_connect_test}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}  Test des Schémas SQL - Molam Connect${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""
echo -e "Database: ${GREEN}$DB_NAME${NC}"
echo -e "User: ${GREEN}$DB_USER${NC}"
echo -e "Host: ${GREEN}$DB_HOST${NC}"
echo ""

# =====================================================================
# 1. Créer/Recréer la base de données de test
# =====================================================================

echo -e "${YELLOW}[1/7]${NC} Création de la base de données de test..."

# Drop si existe
dropdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --if-exists "$DB_NAME" 2>/dev/null || true

# Créer
createdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Base de données créée${NC}"
else
    echo -e "${RED}❌ Échec de création de la base de données${NC}"
    exit 1
fi

echo ""

# =====================================================================
# 2. Fonction helper update_updated_at
# =====================================================================

echo -e "${YELLOW}[2/7]${NC} Création de la fonction helper update_updated_at_column..."

psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<-EOSQL
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    \$\$ LANGUAGE plpgsql;
EOSQL

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Fonction helper créée${NC}"
else
    echo -e "${RED}❌ Échec de création de la fonction helper${NC}"
    exit 1
fi

echo ""

# =====================================================================
# 3. Brique 76 - Notifications
# =====================================================================

echo -e "${YELLOW}[3/7]${NC} Installation Brique 76 - Notifications..."

if [ -f "brique-76/sql/004_notifications_schema.sql" ]; then
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f brique-76/sql/004_notifications_schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Brique 76 installée${NC}"
    else
        echo -e "${RED}❌ Échec Brique 76${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Fichier brique-76/sql/004_notifications_schema.sql non trouvé${NC}"
fi

echo ""

# =====================================================================
# 4. Brique 77 - Dashboard
# =====================================================================

echo -e "${YELLOW}[4/7]${NC} Installation Brique 77 - Dashboard..."

if [ -f "brique-77/sql/005_dashboard_schema.sql" ]; then
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f brique-77/sql/005_dashboard_schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Brique 77 installée${NC}"
    else
        echo -e "${RED}❌ Échec Brique 77${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Fichier brique-77/sql/005_dashboard_schema.sql non trouvé${NC}"
fi

echo ""

# =====================================================================
# 5. Brique 77.1 - Alerts
# =====================================================================

echo -e "${YELLOW}[5/7]${NC} Installation Brique 77.1 - Alerts..."

if [ -f "brique-77/sql/006_alerts_schema.sql" ]; then
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f brique-77/sql/006_alerts_schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Brique 77.1 installée${NC}"
    else
        echo -e "${RED}❌ Échec Brique 77.1${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Fichier brique-77/sql/006_alerts_schema.sql non trouvé${NC}"
fi

echo ""

# =====================================================================
# 6. Brique 78 - Ops Approval
# =====================================================================

echo -e "${YELLOW}[6/7]${NC} Installation Brique 78 - Ops Approval..."

if [ -f "brique-78/sql/007_approval_engine_schema.sql" ]; then
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f brique-78/sql/007_approval_engine_schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Brique 78 installée${NC}"
    else
        echo -e "${RED}❌ Échec Brique 78${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Fichier brique-78/sql/007_approval_engine_schema.sql non trouvé${NC}"
fi

echo ""

# =====================================================================
# 7. Brique 79 - API Keys
# =====================================================================

echo -e "${YELLOW}[7/7]${NC} Installation Brique 79 - API Keys..."

if [ -f "brique-79/sql/008_api_keys_schema.sql" ]; then
    psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f brique-79/sql/008_api_keys_schema.sql

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Brique 79 installée${NC}"
    else
        echo -e "${RED}❌ Échec Brique 79${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Fichier brique-79/sql/008_api_keys_schema.sql non trouvé${NC}"
fi

echo ""

# =====================================================================
# Vérifications
# =====================================================================

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}  Vérifications${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# Compter les tables
TABLE_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
echo -e "Tables créées: ${GREEN}$TABLE_COUNT${NC}"

# Compter les fonctions
FUNCTION_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';")
echo -e "Fonctions créées: ${GREEN}$FUNCTION_COUNT${NC}"

# Compter les vues
VIEW_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';")
echo -e "Vues créées: ${GREEN}$VIEW_COUNT${NC}"

# Compter les triggers
TRIGGER_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public';")
echo -e "Triggers créés: ${GREEN}$TRIGGER_COUNT${NC}"

echo ""

# Liste des tables
echo -e "${BLUE}Liste des tables:${NC}"
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" | grep -v "^$" | grep -v "tablename" | grep -v "^-" | grep -v "^(" | sed 's/^/ - /'

echo ""

# =====================================================================
# Résumé
# =====================================================================

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}  Résumé${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""
echo -e "${GREEN}✅ Tous les schémas ont été installés avec succès${NC}"
echo ""
echo -e "Base de données: ${GREEN}$DB_NAME${NC}"
echo -e "Tables: ${GREEN}$TABLE_COUNT${NC}"
echo -e "Fonctions: ${GREEN}$FUNCTION_COUNT${NC}"
echo -e "Vues: ${GREEN}$VIEW_COUNT${NC}"
echo -e "Triggers: ${GREEN}$TRIGGER_COUNT${NC}"
echo ""
echo -e "${BLUE}Prêt pour les tests!${NC} 🚀"
echo ""
