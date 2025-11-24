# Makefile pour Molam Pay Brique 3

.PHONY: help db-up db-down db-init db-reset dev test

help:
	@echo "Commandes disponibles:"
	@echo "  make db-up     - Démarrer les services Docker"
	@echo "  make db-down   - Arrêter les services Docker"
	@echo "  make db-init   - Initialiser la base de données"
	@echo "  make db-reset  - Réinitialiser la base de données"
	@echo "  make dev       - Démarrer en mode développement"
	@echo "  make test      - Exécuter les tests"

db-up:
	@echo "🔄 Démarrage des services Docker..."
	docker-compose up -d
	@echo "✅ Services Docker démarrés"
	@sleep 5
	@echo "📊 Adminer disponible sur: http://localhost:8081"

db-down:
	@echo "🛑 Arrêt des services Docker..."
	docker-compose down
	@echo "✅ Services Docker arrêtés"

db-init:
	@echo "🗃️  Initialisation de la base de données..."
	npm run db:init

db-reset:
	@echo "🔄 Réinitialisation de la base de données..."
	npm run db:reset

dev:
	@echo "🚀 Démarrage en mode développement..."
	npm run dev

test:
	@echo "🧪 Exécution des tests..."
	npm test

logs:
	@echo "📋 Affichage des logs Docker..."
	docker-compose logs -f

status:
	@echo "📊 Statut des services:"
	docker-compose ps

# Déploiement de la structure complète
setup: db-up db-init
	@echo "🎉 Setup complet terminé!"
	@echo "📊 Adminer: http://localhost:8081"
	@echo "🚀 API: http://localhost:8080"