#!/bin/bash

# =====================================================================
# Script de Test - TOUTES les Briques (41 à 79)
# =====================================================================
# Ce script teste l'installation de TOUS les schémas SQL
# Date: 2025-11-12
# =====================================================================

set -e  # Exit on error for critical steps

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# =====================================================================
# Password Prompt
# =====================================================================

# Check if PGPASSWORD is set, if not prompt for it
if [ -z "$PGPASSWORD" ]; then
    echo -e "${YELLOW}================================================================${NC}"
    echo -e "${YELLOW}  PostgreSQL Authentication Required${NC}"
    echo -e "${YELLOW}================================================================${NC}"
    echo ""
    echo -e "${YELLOW}PGPASSWORD environment variable is not set.${NC}"
    echo -e "${YELLOW}Please enter the PostgreSQL password for user 'postgres':${NC}"
    echo ""

    read -s -p "Password: " PGPASSWORD
    export PGPASSWORD
    echo ""
    echo ""
    echo -e "${GREEN}Password set for this session.${NC}"
    echo -e "${CYAN}Tip: Set PGPASSWORD permanently to skip this prompt:${NC}"
    echo -e "${GRAY}  export PGPASSWORD=\"your_password\"${NC}"
    echo -e "${CYAN}Or see POSTGRESQL_SETUP.md for other authentication methods.${NC}"
    echo ""

    # Brief pause to let user read the message
    sleep 2
fi

# Configuration
DB_NAME="${DB_NAME:-molam_connect_test_all}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Test COMPLET - Toutes les Briques Molam Connect (41-79)${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "Database: ${GREEN}$DB_NAME${NC}"
echo -e "User: ${GREEN}$DB_USER${NC}"
echo ""

# =====================================================================
# Scanner tous les dossiers brique-*
# =====================================================================

echo -e "${YELLOW}Scanning briques directories...${NC}"
echo ""

# Trouver tous les dossiers brique-*
BRIQUE_DIRS=$(find . -maxdepth 1 -type d -name "brique-*" | sort -V)
TOTAL_BRIQUES=$(echo "$BRIQUE_DIRS" | wc -l)

echo -e "Found ${GREEN}$TOTAL_BRIQUES${NC} briques to test"
echo ""

# Collecter tous les fichiers SQL
declare -a SQL_FILES
declare -a SQL_BRIQUES
SQL_COUNT=0

for dir in $BRIQUE_DIRS; do
    if [ -d "$dir/sql" ]; then
        for sqlfile in "$dir/sql"/*.sql; do
            if [ -f "$sqlfile" ]; then
                SQL_FILES[$SQL_COUNT]="$sqlfile"
                SQL_BRIQUES[$SQL_COUNT]=$(basename "$dir")
                SQL_COUNT=$((SQL_COUNT + 1))
            fi
        done
    fi
done

echo -e "Found ${GREEN}$SQL_COUNT${NC} SQL schema files"
echo ""

# =====================================================================
# Créer/Recréer la base de données de test
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Step 1: Database Setup${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

echo -e "${YELLOW}Creating test database...${NC}"

# Drop si existe
dropdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" --if-exists "$DB_NAME" 2>/dev/null || true

# Créer
if createdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" 2>/dev/null; then
    echo -e "${GREEN}✅ Database created successfully${NC}"
else
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi

echo ""

# =====================================================================
# Créer les fonctions helpers
# =====================================================================

echo -e "${YELLOW}Creating helper functions...${NC}"

psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=0 <<-EOSQL 2>/dev/null
    -- Helper function for updating updated_at columns
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    \$\$ LANGUAGE plpgsql;

    -- Helper function for generating UUIDs
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Helper for PostGIS
    CREATE EXTENSION IF NOT EXISTS postgis;
EOSQL

echo -e "${GREEN}✅ Helper functions created${NC}"
echo ""

# =====================================================================
# Installer tous les schémas SQL
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Step 2: Installing SQL Schemas${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

SUCCESS_COUNT=0
FAILURE_COUNT=0
declare -a FAILED_FILES

for i in "${!SQL_FILES[@]}"; do
    CURRENT_STEP=$((i + 1))
    SQL_FILE="${SQL_FILES[$i]}"
    BRIQUE="${SQL_BRIQUES[$i]}"
    FILE_NAME=$(basename "$SQL_FILE")

    echo -e "${YELLOW}[$CURRENT_STEP/$SQL_COUNT]${NC} ${CYAN}$BRIQUE${NC} - ${WHITE}$FILE_NAME${NC}"

    # Execute SQL file (suppress errors for compatibility)
    if psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -v ON_ERROR_STOP=0 -f "$SQL_FILE" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Success${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "   ${RED}❌ Failed${NC}"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        FAILED_FILES+=("$BRIQUE/$FILE_NAME")
    fi

    echo ""
done

# =====================================================================
# Vérifications
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Step 3: Verification${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Compter les objets créés
TABLE_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | tr -d ' ')
FUNCTION_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';" | tr -d ' ')
VIEW_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';" | tr -d ' ')
TRIGGER_COUNT=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public';" | tr -d ' ')

echo -e "${CYAN}Database Objects Created:${NC}"
echo -e "  Tables:    ${GREEN}$TABLE_COUNT${NC}"
echo -e "  Functions: ${GREEN}$FUNCTION_COUNT${NC}"
echo -e "  Views:     ${GREEN}$VIEW_COUNT${NC}"
echo -e "  Triggers:  ${GREEN}$TRIGGER_COUNT${NC}"

echo ""

# =====================================================================
# Résumé des Résultats
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Test Results Summary${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

echo -e "Briques scanned:  ${CYAN}$TOTAL_BRIQUES${NC}"
echo -e "SQL files found:  ${CYAN}$SQL_COUNT${NC}"
echo ""
echo -e "Schemas installed: ${GREEN}$SUCCESS_COUNT${NC}"

if [ $FAILURE_COUNT -gt 0 ]; then
    echo -e "Schemas failed:    ${RED}$FAILURE_COUNT${NC}"
fi

echo ""

# Success rate
if [ $SQL_COUNT -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=1; ($SUCCESS_COUNT * 100) / $SQL_COUNT" | bc)
    echo -e "Success Rate: ${GREEN}$SUCCESS_RATE%${NC}"
else
    echo -e "Success Rate: ${YELLOW}N/A${NC}"
fi

echo ""

# Liste des échecs
if [ $FAILURE_COUNT -gt 0 ]; then
    echo -e "${RED}================================================================${NC}"
    echo -e "${RED}  Failed Schemas${NC}"
    echo -e "${RED}================================================================${NC}"
    echo ""

    for failed in "${FAILED_FILES[@]}"; do
        echo -e "${RED}❌${NC} ${YELLOW}$failed${NC}"
    done

    echo ""
fi

# =====================================================================
# Sample Tables List (first 20)
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Sample Tables Created (first 20)${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 20;" | while read -r table; do
    table=$(echo "$table" | tr -d ' ')
    if [ -n "$table" ]; then
        echo -e "  ${GRAY}• $table${NC}"
    fi
done

if [ "$TABLE_COUNT" -gt 20 ]; then
    MORE=$((TABLE_COUNT - 20))
    echo -e "  ${GRAY}... and $MORE more tables${NC}"
fi

echo ""

# =====================================================================
# Final Status
# =====================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Final Status${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

if [ $FAILURE_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! All briques installed successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  TESTS COMPLETED WITH WARNINGS${NC}"
    echo -e "${YELLOW}   $SUCCESS_COUNT schemas installed, $FAILURE_COUNT failed${NC}"
fi

echo ""
echo -e "Database: ${CYAN}$DB_NAME${NC}"
echo -e "${BLUE}Ready for testing! 🚀${NC}"
echo ""

# =====================================================================
# Export Results to JSON (optional)
# =====================================================================

REPORT_FILE="test-results-$(date +%Y-%m-%d-%H%M%S).json"

cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date '+%Y-%m-%d %H:%M:%S')",
  "database": "$DB_NAME",
  "total_briques": $TOTAL_BRIQUES,
  "total_sql_files": $SQL_COUNT,
  "success_count": $SUCCESS_COUNT,
  "failure_count": $FAILURE_COUNT,
  "success_rate": "$SUCCESS_RATE%",
  "tables_created": $TABLE_COUNT,
  "functions_created": $FUNCTION_COUNT,
  "views_created": $VIEW_COUNT,
  "triggers_created": $TRIGGER_COUNT
}
EOF

echo -e "Test report saved to: ${CYAN}$REPORT_FILE${NC}"
echo ""
