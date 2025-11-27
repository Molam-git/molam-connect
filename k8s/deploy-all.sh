#!/bin/bash
set -e

echo "🚀 Déploiement de Molam Connect sur Kubernetes"
echo ""

cd "$(dirname "$0")"

kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f postgres-pvc.yaml
kubectl apply -f redis-pvc.yaml
kubectl apply -f postgres-deployment.yaml
kubectl apply -f postgres-service.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f redis-service.yaml

echo "⏳ Attente de PostgreSQL et Redis..."
kubectl wait --for=condition=ready pod -l app=postgres -n molam-connect --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n molam-connect --timeout=120s

kubectl apply -f api-deployment.yaml
kubectl apply -f api-service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f api-hpa.yaml

echo ""
echo "✅ Déploiement terminé !"
echo ""
kubectl get pods -n molam-connect
