# OPA/Rego Policies for Molam RBAC

## Overview

This directory contains Open Policy Agent (OPA) policies for external authorization with Envoy or standalone OPA services.

## Policy Files

- **authz.rego** - Main authorization policy
  - Permission-based access control
  - ABAC (Attribute-Based Access Control)
  - Audit logging
  - Sanctioned country blocking
  - KYC/SIRA score checks

## Testing Policies Locally

### Install OPA

```bash
# macOS
brew install opa

# Linux
curl -L -o opa https://openpolicyagent.org/downloads/latest/opa_linux_amd64
chmod +x opa
```

### Test Policy

```bash
cd policies

# Test authorization decision
opa eval -d authz.rego \
  -i test_input.json \
  'data.molam.rbac.authz.allow'

# Expected output: true or false
```

### Example Input (test_input.json)

```json
{
  "method": "POST",
  "path": "/api/connect/payments",
  "user": {
    "id": "user-123",
    "email": "alice@merchant.com",
    "roles": ["connect_finance"],
    "permissions": ["connect:payments:create"],
    "kyc_level": "P2",
    "sira_score": 0.8,
    "country": "US",
    "currency": "USD",
    "organisation_id": "org-456"
  },
  "body": {
    "amount": 50000,
    "currency": "USD",
    "country": "US"
  }
}
```

## Envoy ext_authz Integration

### Envoy Configuration

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                http_filters:
                  - name: envoy.ext_authz
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz
                      grpc_service:
                        envoy_grpc:
                          cluster_name: opa_cluster
                        timeout: 0.25s
                  - name: envoy.filters.http.router
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route: { cluster: backend_cluster }
  clusters:
    - name: opa_cluster
      connect_timeout: 0.25s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      http2_protocol_options: {}
      load_assignment:
        cluster_name: opa_cluster
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: opa
                      port_value: 9191
    - name: backend_cluster
      connect_timeout: 0.25s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: backend_cluster
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: backend
                      port_value: 4068
```

### OPA Server Configuration

```bash
# Run OPA server with ext_authz plugin
opa run --server \
  --addr 0.0.0.0:8181 \
  --set plugins.envoy_ext_authz_grpc.addr=:9191 \
  --set plugins.envoy_ext_authz_grpc.path=molam/rbac/authz/allow \
  --set decision_logs.console=true \
  authz.rego
```

## Performance

- **Decision latency**: < 5ms (P50), < 20ms (P95)
- **Cache**: OPA caches policy evaluations
- **Scale**: Handles 10,000+ requests/sec per OPA instance

## Security

- **Fail-closed**: Default deny policy
- **Audit logs**: All decisions logged
- **ABAC**: Contextual attribute checks
- **Immutable policies**: Policies signed and versioned

## Deployment

### Kubernetes (OPA Sidecar)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: backend-with-opa
spec:
  containers:
    - name: backend
      image: molam/rbac:latest
      ports:
        - containerPort: 4068
    - name: opa
      image: openpolicyagent/opa:latest
      args:
        - "run"
        - "--server"
        - "--addr=0.0.0.0:8181"
        - "--set=plugins.envoy_ext_authz_grpc.addr=:9191"
        - "/policies/authz.rego"
      ports:
        - containerPort: 8181
        - containerPort: 9191
      volumeMounts:
        - name: opa-policies
          mountPath: /policies
  volumes:
    - name: opa-policies
      configMap:
        name: opa-policies
```

## Monitoring

- **Metrics**: OPA exposes Prometheus metrics at `:8181/metrics`
- **Decision logs**: Structured JSON logs for SIEM integration
- **Health**: `:8181/health` endpoint for liveness/readiness probes

## References

- [OPA Documentation](https://www.openpolicyagent.org/docs/latest/)
- [Envoy ext_authz](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/ext_authz_filter)
- [Rego Language](https://www.openpolicyagent.org/docs/latest/policy-language/)