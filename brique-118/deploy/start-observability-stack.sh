#!/bin/bash

###############################################################################
# Brique 118ter: Start Observability Stack
# Lance Prometheus + Grafana + Alertmanager + Metrics Server
###############################################################################

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Brique 118ter - Observability Stack Launcher            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}❌ Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose found${NC}"
echo ""

# Change to deploy directory
cd "$(dirname "$0")"

# Create .env file if not exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file...${NC}"
    cat > .env <<EOF
# Grafana
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin

# Alertmanager
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
EOF
    echo -e "${GREEN}✅ .env created${NC}"
fi

# Start stack
echo -e "${BLUE}🚀 Starting observability stack...${NC}"
echo ""

docker-compose -f docker-compose.observability.yml up -d

echo ""
echo -e "${GREEN}✅ Stack started successfully!${NC}"
echo ""

# Wait for services
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
services=("metrics-server" "prometheus" "grafana")
all_healthy=true

for service in "${services[@]}"; do
    if docker ps --filter "name=molam-$service" --filter "health=healthy" | grep -q "molam-$service"; then
        echo -e "${GREEN}✅ $service is healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  $service is starting...${NC}"
        all_healthy=false
    fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  🎉 Observability Stack Ready!                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Access your services:"
echo ""
echo -e "${BLUE}Metrics Server:${NC}    http://localhost:3000/metrics"
echo -e "${BLUE}Health Check:${NC}      http://localhost:3000/health"
echo ""
echo -e "${BLUE}Prometheus:${NC}        http://localhost:9090"
echo -e "  └─ Targets:${NC}         http://localhost:9090/targets"
echo -e "  └─ Alerts:${NC}          http://localhost:9090/alerts"
echo -e "  └─ Graph:${NC}           http://localhost:9090/graph"
echo ""
echo -e "${BLUE}Grafana:${NC}           http://localhost:3001"
echo -e "  └─ Username:${NC}        admin"
echo -e "  └─ Password:${NC}        admin"
echo ""
echo -e "${BLUE}Alertmanager:${NC}      http://localhost:9093"
echo ""
echo -e "${BLUE}Node Exporter:${NC}     http://localhost:9100/metrics"
echo ""
echo ""
echo "🔍 Useful commands:"
echo ""
echo "  # View logs"
echo "  docker-compose -f docker-compose.observability.yml logs -f"
echo ""
echo "  # View specific service logs"
echo "  docker-compose -f docker-compose.observability.yml logs -f metrics-server"
echo "  docker-compose -f docker-compose.observability.yml logs -f prometheus"
echo "  docker-compose -f docker-compose.observability.yml logs -f grafana"
echo ""
echo "  # Stop stack"
echo "  docker-compose -f docker-compose.observability.yml down"
echo ""
echo "  # Stop and remove volumes"
echo "  docker-compose -f docker-compose.observability.yml down -v"
echo ""
echo "  # Restart a service"
echo "  docker-compose -f docker-compose.observability.yml restart metrics-server"
echo ""
echo ""
echo "📈 Next steps:"
echo "  1. Open Grafana: http://localhost:3001"
echo "  2. Import the dashboard (already provisioned)"
echo "  3. Start generating metrics:"
echo "     cd ../scripts && ts-node generate-metrics.ts"
echo "  4. Watch metrics update in real-time!"
echo ""
