# Brique 118ter: Start Observability Stack (Windows)
# Lance Prometheus + Grafana + Alertmanager + Metrics Server

param(
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Brique 118ter - Observability Stack Launcher

Usage: .\start-observability-stack.ps1

This script starts the complete observability stack:
- Metrics Server (port 3000)
- Prometheus (port 9090)
- Grafana (port 3001)
- Alertmanager (port 9093)
- Node Exporter (port 9100)

Requirements:
- Docker Desktop for Windows
- Docker Compose

Commands after starting:
  View logs:      docker-compose -f docker-compose.observability.yml logs -f
  Stop stack:     docker-compose -f docker-compose.observability.yml down
  Restart:        docker-compose -f docker-compose.observability.yml restart
"@
    exit 0
}

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Brique 118ter - Observability Stack Launcher            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Docker
try {
    docker --version | Out-Null
    Write-Host "✅ Docker found" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed or not running" -ForegroundColor Red
    exit 1
}

try {
    docker-compose --version | Out-Null
    Write-Host "✅ Docker Compose found" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not installed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Change to deploy directory
Set-Location $PSScriptRoot

# Create .env file if not exists
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file..." -ForegroundColor Yellow

    @"
# Grafana
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin

# Alertmanager
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
"@ | Out-File -FilePath ".env" -Encoding UTF8

    Write-Host "✅ .env created" -ForegroundColor Green
}

# Start stack
Write-Host "🚀 Starting observability stack..." -ForegroundColor Blue
Write-Host ""

docker-compose -f docker-compose.observability.yml up -d

Write-Host ""
Write-Host "✅ Stack started successfully!" -ForegroundColor Green
Write-Host ""

# Wait for services
Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service health
$services = @("metrics-server", "prometheus", "grafana")
$all_healthy = $true

foreach ($service in $services) {
    $container = docker ps --filter "name=molam-$service" --filter "health=healthy" --format "{{.Names}}"

    if ($container -match "molam-$service") {
        Write-Host "✅ $service is healthy" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $service is starting..." -ForegroundColor Yellow
        $all_healthy = $false
    }
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  🎉 Observability Stack Ready!                            ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Access your services:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Metrics Server:    http://localhost:3000/metrics" -ForegroundColor Blue
Write-Host "Health Check:      http://localhost:3000/health" -ForegroundColor Blue
Write-Host ""
Write-Host "Prometheus:        http://localhost:9090" -ForegroundColor Blue
Write-Host "  └─ Targets:      http://localhost:9090/targets" -ForegroundColor Gray
Write-Host "  └─ Alerts:       http://localhost:9090/alerts" -ForegroundColor Gray
Write-Host "  └─ Graph:        http://localhost:9090/graph" -ForegroundColor Gray
Write-Host ""
Write-Host "Grafana:           http://localhost:3001" -ForegroundColor Blue
Write-Host "  └─ Username:     admin" -ForegroundColor Gray
Write-Host "  └─ Password:     admin" -ForegroundColor Gray
Write-Host ""
Write-Host "Alertmanager:      http://localhost:9093" -ForegroundColor Blue
Write-Host ""
Write-Host "Node Exporter:     http://localhost:9100/metrics" -ForegroundColor Blue
Write-Host ""
Write-Host ""
Write-Host "🔍 Useful commands:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # View logs"
Write-Host "  docker-compose -f docker-compose.observability.yml logs -f" -ForegroundColor Gray
Write-Host ""
Write-Host "  # Stop stack"
Write-Host "  docker-compose -f docker-compose.observability.yml down" -ForegroundColor Gray
Write-Host ""
Write-Host "  # Stop and remove volumes"
Write-Host "  docker-compose -f docker-compose.observability.yml down -v" -ForegroundColor Gray
Write-Host ""
Write-Host ""
Write-Host "📈 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open Grafana: http://localhost:3001"
Write-Host "  2. Import the dashboard (already provisioned)"
Write-Host "  3. Start generating metrics:"
Write-Host "     cd ..\scripts; ts-node generate-metrics.ts"
Write-Host "  4. Watch metrics update in real-time!"
Write-Host ""
