#!/bin/bash

# =============================================================================
# Molam Connect - Démarrage Briques 137 & 138ter
# =============================================================================

set -e

echo "============================================================"
echo "🚀 DÉMARRAGE BRIQUES 137 & 138ter"
echo "============================================================"

# Couleurs pour output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier que nous sommes dans le bon répertoire
if [ ! -d "brique-137" ] || [ ! -d "brique-138ter" ]; then
    echo "❌ Erreur: ce script doit être exécuté depuis le répertoire molam-connect/"
    exit 1
fi

# =============================================================================
# Fonction: Check Prerequisites
# =============================================================================
check_prerequisites() {
    echo -e "${BLUE}🔍 Vérification des prérequis...${NC}"

    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        echo -e "${YELLOW}⚠️  PostgreSQL CLI non trouvé. Installation manuelle des migrations requise.${NC}"
    else
        echo -e "${GREEN}✅ PostgreSQL disponible${NC}"
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js non installé"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

    # Check npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm non installé"
        exit 1
    fi
    echo -e "${GREEN}✅ npm $(npm --version)${NC}"

    # Check Redis (optionnel, juste un warning)
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${YELLOW}⚠️  Redis CLI non trouvé. Assurez-vous que Redis tourne.${NC}"
    else
        echo -e "${GREEN}✅ Redis disponible${NC}"
    fi

    # Check Kafka (optionnel, juste un warning)
    if ! command -v kafka-console-consumer &> /dev/null; then
        echo -e "${YELLOW}⚠️  Kafka CLI non trouvé. Assurez-vous que Kafka tourne.${NC}"
    else
        echo -e "${GREEN}✅ Kafka disponible${NC}"
    fi

    echo ""
}

# =============================================================================
# Fonction: Build Projects
# =============================================================================
build_projects() {
    echo -e "${BLUE}🔨 Build des projets TypeScript...${NC}"

    # Build Brique 137
    echo -e "${BLUE}📦 Build Brique 137 - Merchant Dashboard...${NC}"
    cd brique-137/merchant-dashboard
    if [ ! -d "node_modules" ]; then
        echo "Installation dépendances..."
        npm install --include=dev
    fi
    npm run build
    cd ../..
    echo -e "${GREEN}✅ Brique 137 compilée${NC}"

    # Build Brique 138ter
    echo -e "${BLUE}📦 Build Brique 138ter - Cooperative Failover Mesh...${NC}"
    cd brique-138ter/cooperative-failover-mesh
    if [ ! -d "node_modules" ]; then
        echo "Installation dépendances..."
        npm install --include=dev
    fi
    npm run build
    cd ../..
    echo -e "${GREEN}✅ Brique 138ter compilée${NC}"

    echo ""
}

# =============================================================================
# Fonction: Check Database Migrations
# =============================================================================
check_migrations() {
    echo -e "${BLUE}🗄️  Vérification des migrations DB...${NC}"

    if [ -z "$DATABASE_URL" ]; then
        echo -e "${YELLOW}⚠️  DATABASE_URL non défini. Migrations à exécuter manuellement:${NC}"
        echo "   cd brique-137/merchant-dashboard && npm run migrate"
        echo "   cd brique-138ter/cooperative-failover-mesh && psql \$DATABASE_URL -f migrations/2025_01_19_create_mesh_system.sql"
    else
        echo -e "${GREEN}✅ DATABASE_URL configuré${NC}"

        read -p "Exécuter les migrations maintenant? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Exécution migrations Brique 137..."
            cd brique-137/merchant-dashboard
            npm run migrate || echo "Migration Brique 137 échouée (peut-être déjà appliquée)"
            cd ../..

            echo "Exécution migrations Brique 138ter..."
            psql "$DATABASE_URL" -f brique-138ter/cooperative-failover-mesh/migrations/2025_01_19_create_mesh_system.sql || echo "Migration Brique 138ter échouée (peut-être déjà appliquée)"
        fi
    fi

    echo ""
}

# =============================================================================
# Fonction: Start Services
# =============================================================================
start_services() {
    echo -e "${BLUE}🚀 Démarrage des services...${NC}"

    MODE=${1:-dev}

    if [ "$MODE" = "dev" ]; then
        echo -e "${YELLOW}Mode: DÉVELOPPEMENT (avec hot reload)${NC}"
        echo ""
        echo "Démarrage dans des terminaux séparés:"
        echo ""
        echo -e "${GREEN}Terminal 1 - Merchant Dashboard (Port 3001):${NC}"
        echo "  cd brique-137/merchant-dashboard && npm run dev"
        echo ""
        echo -e "${GREEN}Terminal 2 - Merchant Dashboard KPI Worker (Kafka):${NC}"
        echo "  cd brique-137/merchant-dashboard && npm run worker"
        echo ""
        echo -e "${GREEN}Terminal 3 - Cooperative Failover Mesh (Port 3138):${NC}"
        echo "  cd brique-138ter/cooperative-failover-mesh && npm run dev"
        echo ""
        echo -e "${BLUE}Lancement automatique dans 3 secondes...${NC}"
        sleep 3

        # Ouvrir dans des terminaux séparés (selon l'OS)
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            gnome-terminal -- bash -c "cd brique-137/merchant-dashboard && npm run dev; exec bash" &
            gnome-terminal -- bash -c "cd brique-137/merchant-dashboard && npm run worker; exec bash" &
            gnome-terminal -- bash -c "cd brique-138ter/cooperative-failover-mesh && npm run dev; exec bash" &
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            osascript -e 'tell app "Terminal" to do script "cd '"$PWD"'/brique-137/merchant-dashboard && npm run dev"' &
            osascript -e 'tell app "Terminal" to do script "cd '"$PWD"'/brique-137/merchant-dashboard && npm run worker"' &
            osascript -e 'tell app "Terminal" to do script "cd '"$PWD"'/brique-138ter/cooperative-failover-mesh && npm run dev"' &
        elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
            start cmd /k "cd brique-137/merchant-dashboard && npm run dev"
            start cmd /k "cd brique-137/merchant-dashboard && npm run worker"
            start cmd /k "cd brique-138ter/cooperative-failover-mesh && npm run dev"
        else
            echo -e "${YELLOW}⚠️  OS non reconnu. Lancer manuellement les commandes ci-dessus.${NC}"
        fi
    else
        echo -e "${YELLOW}Mode: PRODUCTION${NC}"
        echo ""
        echo "Démarrage dans des process background avec PM2 recommandé:"
        echo ""
        echo "  pm2 start brique-137/merchant-dashboard/dist/server.js --name merchant-dashboard"
        echo "  pm2 start brique-137/merchant-dashboard/dist/workers/kpiWorker.js --name merchant-kpi-worker"
        echo "  pm2 start brique-138ter/cooperative-failover-mesh/dist/server.js --name mesh-controller"
        echo ""
    fi
}

# =============================================================================
# Fonction: Display Info
# =============================================================================
display_info() {
    echo ""
    echo "============================================================"
    echo "✅ SERVICES DÉMARRÉS"
    echo "============================================================"
    echo ""
    echo -e "${GREEN}📊 Brique 137 - Merchant Dashboard${NC}"
    echo "  URL: http://localhost:3001"
    echo "  Health: http://localhost:3001/health"
    echo "  API Base: http://localhost:3001/api/merchant"
    echo ""
    echo "  Endpoints principaux:"
    echo "    GET  /api/merchant/summary?period=mtd&currency=XOF"
    echo "    GET  /api/merchant/transactions?limit=50&offset=0"
    echo "    POST /api/merchant/refund"
    echo "    GET  /api/merchant/payouts"
    echo "    GET  /api/merchant/disputes"
    echo ""
    echo -e "${GREEN}🌐 Brique 138ter - Cooperative Failover Mesh${NC}"
    echo "  URL: http://localhost:3138"
    echo "  Health: http://localhost:3138/health"
    echo "  API Base: http://localhost:3138/api/mesh"
    echo ""
    echo "  Endpoints principaux:"
    echo "    GET  /api/mesh/regions"
    echo "    GET  /api/mesh/predictions"
    echo "    POST /api/mesh/predictions/generate"
    echo "    GET  /api/mesh/proposals"
    echo "    POST /api/mesh/proposals/:id/simulate"
    echo "    POST /api/mesh/proposals/:id/approve"
    echo ""
    echo -e "${BLUE}📚 Documentation complète:${NC}"
    echo "  - BRIQUE_137_138TER_INTEGRATION.md"
    echo "  - brique-137/merchant-dashboard/README.md"
    echo "  - brique-138ter/cooperative-failover-mesh/README.md"
    echo ""
    echo -e "${YELLOW}⚙️  Configuration:${NC}"
    echo "  - Brique 137: brique-137/merchant-dashboard/.env"
    echo "  - Brique 138ter: brique-138ter/cooperative-failover-mesh/.env"
    echo ""
    echo "============================================================"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    check_prerequisites
    build_projects
    check_migrations
    start_services "${1:-dev}"
    display_info
}

# Run main avec argument (dev ou prod)
main "$@"
