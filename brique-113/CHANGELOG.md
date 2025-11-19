# Changelog

All notable changes to SIRA Inference Service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added
- Initial release of SIRA Inference Service
- Deterministic canary routing based on `hash(event_id)`
- ONNX Runtime integration for fast inference
- LRU cache with configurable size and TTL
- Model hot-swapping from S3
- Prometheus metrics for observability
- Structured logging with Winston
- JWT and mTLS authentication
- Kubernetes deployment manifests (Deployment, Service, HPA, PDB)
- Comprehensive API endpoints:
  - POST /v1/infer - Make predictions
  - GET /v1/infer/:id - Get prediction details
  - GET /v1/models - List loaded models
  - POST /v1/canary - Configure canary deployment
  - GET /v1/canary/:product - Get canary config
  - POST /v1/canary/:product/stop - Stop canary
  - GET /healthz - Health check
  - GET /readyz - Readiness probe
  - GET /metrics - Prometheus metrics
- Grafana dashboard JSON template
- Comprehensive test suite
- Production runbook
- Immutable prediction logging to `siramodel_predictions`
- Auto-rollback based on performance metrics
- Role-based access control (RBAC)

### Performance
- P50 latency: < 2ms (cache hit)
- P95 latency: < 30ms (cache miss)
- Throughput: 1000+ RPS per pod

### Security
- JWT authentication for external clients
- Internal service token for service-to-service calls
- mTLS support for internal communication
- Secrets managed via Kubernetes secrets / Vault
- PII redaction in logs

## [Unreleased]

### Planned
- Redis distributed cache for multi-pod consistency
- GPU support for large models
- Batch inference API
- gRPC endpoints for lower latency
- A/B testing framework (beyond canary)
- Real-time SHAP computation
- Model drift detection
- Auto-scaling based on custom metrics
- Multi-region deployment
- Blue-green deployment support
