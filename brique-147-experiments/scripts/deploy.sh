#!/bin/bash

###############################################################################
# Molam Experiments - Deployment Script
#
# Usage:
#   ./scripts/deploy.sh staging
#   ./scripts/deploy.sh production
#   ./scripts/deploy.sh staging --skip-migration
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
K8S_DIR="$PROJECT_ROOT/k8s"

ENVIRONMENT="${1:-staging}"
SKIP_MIGRATION="${2:-}"

NAMESPACE="molam-pay"
APP_NAME="molam-experiments"
REGISTRY="ghcr.io/molam"

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC}  $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        log_error "docker not found. Please install Docker."
        exit 1
    fi

    # Check kubectl connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

validate_environment() {
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        log_error "Invalid environment. Use 'staging' or 'production'."
        exit 1
    fi

    log_info "Deploying to: $ENVIRONMENT"

    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warning "You are about to deploy to PRODUCTION!"
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
}

set_image_tag() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        IMAGE_TAG="main-latest"
    else
        IMAGE_TAG="develop-latest"
    fi

    log_info "Using image tag: $IMAGE_TAG"
}

validate_manifests() {
    log_info "Validating Kubernetes manifests..."

    cd "$K8S_DIR"

    for file in namespace.yaml configmap.yaml serviceaccount-rbac.yaml service.yaml deployment.yaml hpa.yaml pdb.yaml ingress.yaml; do
        if [[ ! -f "$file" ]]; then
            log_error "Missing manifest file: $file"
            exit 1
        fi

        if ! kubectl apply --dry-run=client -f "$file" &> /dev/null; then
            log_error "Invalid manifest: $file"
            kubectl apply --dry-run=client -f "$file"
            exit 1
        fi
    done

    log_success "All manifests valid"
}

check_secrets() {
    log_info "Checking secrets..."

    if ! kubectl get secret "$APP_NAME-secrets" -n "$NAMESPACE" &> /dev/null; then
        log_error "Secret $APP_NAME-secrets not found in namespace $NAMESPACE"
        log_error "Please create secrets first:"
        echo ""
        echo "  kubectl create secret generic $APP_NAME-secrets \\"
        echo "    --namespace=$NAMESPACE \\"
        echo "    --from-literal=DATABASE_URL=... \\"
        echo "    --from-literal=MOLAM_ID_PUBLIC_KEY=... \\"
        echo "    --from-literal=SIRA_URL=..."
        echo ""
        exit 1
    fi

    log_success "Secrets found"
}

update_image_tag() {
    log_info "Updating deployment with image: $REGISTRY/$APP_NAME:$IMAGE_TAG"

    cd "$K8S_DIR"

    # Create temporary file with updated image
    sed "s|image: ghcr.io/molam/molam-experiments:.*|image: $REGISTRY/$APP_NAME:$IMAGE_TAG|g" deployment.yaml > deployment.tmp.yaml

    log_success "Image tag updated"
}

apply_manifests() {
    log_info "Applying Kubernetes manifests..."

    cd "$K8S_DIR"

    kubectl apply -f namespace.yaml
    kubectl apply -f configmap.yaml
    kubectl apply -f serviceaccount-rbac.yaml
    kubectl apply -f service.yaml
    kubectl apply -f deployment.tmp.yaml
    kubectl apply -f hpa.yaml
    kubectl apply -f pdb.yaml
    kubectl apply -f ingress.yaml

    # Apply ServiceMonitor if Prometheus Operator is installed
    if kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
        kubectl apply -f servicemonitor.yaml
        log_success "ServiceMonitor applied"
    fi

    # Cleanup temp file
    rm -f deployment.tmp.yaml

    log_success "Manifests applied"
}

run_migrations() {
    if [[ "$SKIP_MIGRATION" == "--skip-migration" ]]; then
        log_warning "Skipping database migrations"
        return
    fi

    log_info "Running database migrations..."

    cd "$K8S_DIR"

    # Delete old migration job if exists
    kubectl delete job "$APP_NAME-migrate" -n "$NAMESPACE" --ignore-not-found=true

    # Apply migration job
    kubectl apply -f db-migration-job.yaml

    # Wait for completion
    log_info "Waiting for migration to complete (timeout: 5 minutes)..."
    if kubectl wait --for=condition=complete --timeout=300s job/"$APP_NAME-migrate" -n "$NAMESPACE"; then
        log_success "Migration completed successfully"

        # Show migration logs
        log_info "Migration logs:"
        kubectl logs -n "$NAMESPACE" job/"$APP_NAME-migrate" --tail=50
    else
        log_error "Migration failed or timed out"
        kubectl logs -n "$NAMESPACE" job/"$APP_NAME-migrate" --tail=100
        exit 1
    fi
}

wait_for_rollout() {
    log_info "Waiting for deployment rollout..."

    if kubectl rollout status deployment/"$APP_NAME" -n "$NAMESPACE" --timeout=10m; then
        log_success "Deployment rolled out successfully"
    else
        log_error "Rollout failed or timed out"
        exit 1
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."

    # Check pods
    log_info "Checking pods..."
    kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME"

    # Check if pods are running
    READY_PODS=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME" -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' | wc -w)

    if [[ $READY_PODS -eq 0 ]]; then
        log_error "No pods running"
        exit 1
    fi

    log_success "$READY_PODS pod(s) running"

    # Check service
    log_info "Checking service..."
    kubectl get svc -n "$NAMESPACE" "$APP_NAME"

    # Check ingress
    log_info "Checking ingress..."
    kubectl get ingress -n "$NAMESPACE" "$APP_NAME-ingress"

    log_success "Deployment verified"
}

run_smoke_tests() {
    log_info "Running smoke tests..."

    # Get ingress URL
    INGRESS_URL=$(kubectl get ingress -n "$NAMESPACE" "$APP_NAME-ingress" -o jsonpath='{.spec.rules[0].host}')

    if [[ -z "$INGRESS_URL" ]]; then
        log_warning "Ingress URL not found, skipping smoke tests"
        return
    fi

    # Test health endpoint
    log_info "Testing https://$INGRESS_URL/healthz"

    if curl -f -s "https://$INGRESS_URL/healthz" > /dev/null; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        exit 1
    fi

    log_success "Smoke tests passed"
}

show_deployment_info() {
    echo ""
    log_success "========================================="
    log_success "Deployment completed successfully!"
    log_success "========================================="
    echo ""
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Image: $REGISTRY/$APP_NAME:$IMAGE_TAG"
    echo ""

    # Get ingress URL
    INGRESS_URL=$(kubectl get ingress -n "$NAMESPACE" "$APP_NAME-ingress" -o jsonpath='{.spec.rules[0].host}')
    if [[ -n "$INGRESS_URL" ]]; then
        log_info "URL: https://$INGRESS_URL"
    fi

    echo ""
    log_info "Useful commands:"
    echo "  - View pods:    kubectl get pods -n $NAMESPACE -l app=$APP_NAME"
    echo "  - View logs:    kubectl logs -n $NAMESPACE -l app=$APP_NAME -f"
    echo "  - Rollback:     kubectl rollout undo deployment/$APP_NAME -n $NAMESPACE"
    echo ""
}

# Main execution
main() {
    echo ""
    log_info "========================================="
    log_info "Molam Experiments - Deployment Script"
    log_info "========================================="
    echo ""

    check_prerequisites
    validate_environment
    set_image_tag
    validate_manifests
    check_secrets
    update_image_tag
    apply_manifests
    run_migrations
    wait_for_rollout
    verify_deployment
    run_smoke_tests
    show_deployment_info
}

# Run main function
main "$@"
