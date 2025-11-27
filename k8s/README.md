# Kubernetes - Molam Connect

Manifests Kubernetes pour déployer Molam Connect.

## Déploiement rapide

```bash
# Option 1: Script automatique
./deploy-all.sh

# Option 2: Manuel
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f postgres-pvc.yaml
kubectl apply -f redis-pvc.yaml
kubectl apply -f postgres-deployment.yaml
kubectl apply -f postgres-service.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f redis-service.yaml
kubectl wait --for=condition=ready pod -l app=postgres -n molam-connect --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n molam-connect --timeout=120s
kubectl apply -f api-deployment.yaml
kubectl apply -f api-service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f api-hpa.yaml
```

## Fichiers

- `namespace.yaml` - Namespace molam-connect
- `configmap.yaml` - Variables d'environnement
- `secrets.yaml` - Secrets (DB, Redis, JWT, Molam API keys, etc.)
- `postgres-pvc.yaml` - Stockage PostgreSQL (20Gi)
- `redis-pvc.yaml` - Stockage Redis (5Gi)
- `postgres-deployment.yaml` - Deployment PostgreSQL
- `postgres-service.yaml` - Service PostgreSQL
- `redis-deployment.yaml` - Deployment Redis
- `redis-service.yaml` - Service Redis
- `api-deployment.yaml` - Deployment API (3-20 replicas HPA)
- `api-service.yaml` - Service API (ports 3000, 3001, 9090)
- `ingress.yaml` - Ingress (pay.molam.io, dashboard.molam.io, metrics)
- `api-hpa.yaml` - Autoscaling API

## Commandes utiles

```bash
# Status
kubectl get pods -n molam-connect
kubectl get svc -n molam-connect
kubectl get ingress -n molam-connect
kubectl get hpa -n molam-connect

# Logs
kubectl logs -f deployment/molam-connect-api -n molam-connect
kubectl logs -f deployment/postgres -n molam-connect
kubectl logs -f deployment/redis -n molam-connect

# Port-forward (test local)
kubectl port-forward svc/molam-connect-api-service 3000:3000 -n molam-connect
kubectl port-forward svc/molam-connect-api-service 3001:3001 -n molam-connect  # Dashboard
kubectl port-forward svc/molam-connect-api-service 9090:9090 -n molam-connect  # Metrics

# Supprimer
kubectl delete namespace molam-connect
```

## Avant de déployer

1. **Modifier les secrets** dans `secrets.yaml` (DB_PASSWORD, JWT_SECRET, MOLAM_SECRET_KEY, etc.)
2. **Mettre à jour l'image** dans `api-deployment.yaml`
3. **Configurer les domaines** dans `ingress.yaml`
4. **Ajuster les ConfigMaps** dans `configmap.yaml` (MOCK_SIRA, MOCK_SMS, etc.)

Voir le guide complet: [KUBERNETES_DEPLOYMENT_GUIDE.md](../../KUBERNETES_DEPLOYMENT_GUIDE.md)
