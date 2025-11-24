# Brique 40 - Fraud Ops & Playbooks

## Objectif
Créer une brique industrielle complète qui transforme la Fraud Console en device opérationnel pour les équipes Fraud / Ops.

## Prérequis
- Node.js 18+
- PostgreSQL
- Kafka
- Docker & Docker Compose

## Installation

1. **Variables d'environnement**
```bash
export DATABASE_URL=postgres://molam:molam@localhost:5432/fraud_ops
export KAFKA_BROKERS=localhost:9092
export MOLAM_ID_PUBLIC_KEY="your-public-key-here"