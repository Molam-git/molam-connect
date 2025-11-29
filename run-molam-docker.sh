#!/bin/bash

clear

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║            MOLAM CONNECT - DOCKER BUILD & RUN                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Ce script va :"
echo "  1. Arrêter les conteneurs existants"
echo "  2. Builder l'image Docker"
echo "  3. Démarrer tous les services (PostgreSQL, Redis, API)"
echo ""
read -p "Appuyez sur Entrée pour continuer..."

echo ""
echo "[1/4] Arrêt des conteneurs existants..."
docker-compose -f docker-compose.full.yml down
echo "     - OK"
echo ""

echo "[2/4] Build de l'image Docker..."
echo "     (Cela peut prendre quelques minutes la première fois)"
docker-compose -f docker-compose.full.yml build
if [ $? -ne 0 ]; then
    echo "     - ERREUR lors du build !"
    exit 1
fi
echo "     - OK"
echo ""

echo "[3/4] Démarrage des conteneurs..."
docker-compose -f docker-compose.full.yml up -d
if [ $? -ne 0 ]; then
    echo "     - ERREUR lors du démarrage !"
    exit 1
fi
echo "     - OK"
echo ""

echo "[4/4] Attente du démarrage complet..."
sleep 10
echo "     - OK"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    DÉMARRAGE TERMINÉ !                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo " Services en cours d'exécution:"
echo "   - PostgreSQL         : localhost:5434"
echo "   - Redis              : localhost:6379"
echo "   - API Backend        : http://localhost:3000"
echo "   - Dashboard          : http://localhost:3002/dashboard"
echo "   - Metrics (Prometheus): http://localhost:9090/metrics"
echo ""
echo " Pour tester l'API :"
echo "   > curl http://localhost:3000/health"
echo ""
echo " Pour voir les logs en temps réel :"
echo "   docker-compose -f docker-compose.full.yml logs -f"
echo ""
echo " Pour arrêter tous les services :"
echo "   docker-compose -f docker-compose.full.yml down"
echo ""

# Ouvrir le navigateur (selon l'OS)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:3001/dashboard 2>/dev/null || true
elif [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3001/dashboard
fi

echo " Appuyez sur Entrée pour fermer..."
read
