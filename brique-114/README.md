# Brique 114: SIRA Explainability & Feedback UI

**Interface opérationnelle pour visualiser les prédictions SIRA, leur explainability (SHAP), et collecter feedback pour améliorer le modèle.**

## 📋 Vue d'ensemble

Brique 114 fournit :

- ✅ **Visualisation prédictions** : Liste paginée avec filtres (product, status, label, date range)
- ✅ **Explainability** : SHAP explanations avec top 10 features + contribution
- ✅ **Feedback loop** : Labels (fraud/ok/needs_review), comments, evidence upload
- ✅ **Override decisions** : Multi-signature pour overrides à haut risque
- ✅ **Review queue** : Workflow d'assignation et review
- ✅ **Evidence management** : Upload S3 avec presigned URLs, hash pour provenance
- ✅ **Retraining ingestion** : Worker Kafka consomme feedback → training dataset
- ✅ **Multi-tenant** : Scoping par country/legal entity + RBAC
- ✅ **Audit immuable** : Toutes actions loggées

## 🏗️ Architecture

```
brique-114/
├── migrations/
│   └── 001_sira_explainability_feedback.sql  # 5 tables + fonctions + vues
├── src/
│   ├── server.ts                              # Serveur Express (port 8114)
│   ├── routes/
│   │   └── sira.ts                           # API routes complètes
│   ├── services/
│   │   ├── explainService.ts                # Compute SHAP explanations
│   │   ├── multisigService.ts               # Multi-signature logic
│   │   └── evidenceService.ts               # S3 upload, presigned URLs
│   └── utils/
│       ├── rbac.ts                          # RBAC + tenant scoping
│       └── audit.ts                         # Audit logging
├── web/
│   └── src/
│       ├── SiraReviewDashboard.tsx          # Main dashboard
│       ├── ExplainPanel.tsx                 # Explain + feedback form
│       ├── PredictionRow.tsx               # Prediction list item
│       └── EvidenceUploader.tsx             # File upload component
├── workers/
│   └── feedback-consumer.ts                 # Kafka consumer pour retraining
└── tests/
    └── sira.test.ts                         # Unit tests
```

## 🗄️ Schéma de Base de Données

### Tables principales

1. **sira_feedback** - Labels et evidence
   - prediction_id, reviewer_id, label, override_decision
   - comment, evidence (JSONB), multisig_approvals

2. **sira_review_queue** - Workflow d'approbation
   - prediction_id, assigned_to, status, priority
   - Assignment/closure metadata

3. **sira_explain_cache** - Cache SHAP explanations
   - prediction_id, explain_json, cache_hit_count
   - Computation time tracking

4. **sira_evidence** - Métadonnées fichiers evidence
   - feedback_id, s3_key, file_hash, malware_scan_status
   - PII redaction tracking

5. **sira_multisig_approvals** - Approbations multi-signature
   - feedback_id, approver_id, signature, signed_at

### Vues utiles

- `sira_predictions_with_feedback` - Predictions avec statut feedback
- `sira_reviewer_stats` - Statistiques reviewers (30 jours)

## 🚀 Installation

### 1. Prérequis

- Node.js 18+
- PostgreSQL 12+
- SIRA Explain service (ou mock)
- Kafka (pour worker)
- AWS S3 (pour evidence storage)

### 2. Installation

```bash
cd brique-114
npm install
```

### 3. Configuration

```env
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect
MOLAM_ID_JWT_PUBLIC=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
EXPLAINER_URL=http://localhost:8001
KAFKA_BROKERS=localhost:9092
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
EVIDENCE_BUCKET=molam-sira-evidence
MULTISIG_AMOUNT_THRESHOLD=10000
PORT=8114
LOG_LEVEL=info
```

### 4. Migrations

```bash
npm run migrate
```

### 5. Démarrer

```bash
# Serveur API
npm run dev

# Worker (terminal séparé)
npm run worker:feedback-consumer
```

## 📡 API Endpoints

### Predictions

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/sira/predictions` | List predictions (paged + filters) | sira_reviewer |
| GET | `/api/sira/predictions/:id` | Get prediction + explain | sira_reviewer |

### Feedback

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/sira/feedback` | Create feedback (label + evidence) | sira_reviewer |
| POST | `/api/sira/override` | Override decision (multi-sig) | pay_admin |

### Review Queue

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/sira/review_queue/:id/assign` | Assign reviewer | pay_admin |
| POST | `/api/sira/review_queue/:id/close` | Close queue item | pay_admin |

### Evidence

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/s3/presign` | Generate presigned URL | sira_reviewer |
| POST | `/api/sira/upload_evidence` | Register evidence | sira_reviewer |

### Metrics

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/sira/metrics` | Aggregated metrics | sira_reviewer |

## 💻 Exemples d'utilisation

### Lister prédictions

```bash
curl -X GET "http://localhost:8114/api/sira/predictions?limit=50&product=payments" \
  -H "Authorization: Bearer $TOKEN"
```

### Créer feedback

```bash
curl -X POST http://localhost:8114/api/sira/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prediction_id": "uuid",
    "label": "fraud",
    "comment": "Confirmed fraud case",
    "override_decision": null
  }'
```

### Override avec multi-sig

```bash
curl -X POST http://localhost:8114/api/sira/override \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prediction_id": "uuid",
    "override_decision": "reject",
    "justification": "High risk transaction"
  }'
```

## 🎨 Interface React

### SiraReviewDashboard

Dashboard principal avec :
- Liste prédictions (infinite scroll)
- Métriques (total, pending)
- Sélection prédiction → ExplainPanel

### ExplainPanel

Affiche :
- **SHAP Chart** : Top 10 features avec contribution (bar chart)
- **Feedback Form** : Label, comment, override decision
- **Evidence Uploader** : Upload fichiers (S3 presigned)
- **Feedback History** : Historique des feedbacks

### EvidenceUploader

Flow :
1. User sélectionne fichier
2. Request presigned URL (`POST /api/s3/presign`)
3. Upload direct à S3
4. Compute hash (SHA-256)
5. Register evidence (`POST /api/sira/upload_evidence`)

## 🔄 Worker Feedback Consumer

Le worker consomme `sira.feedback.created` events depuis Kafka et :

1. Récupère prediction + features
2. Insère dans `sira_training_examples` (B115)
3. Validation, déduplication, sampling

**Démarrage** :
```bash
npm run worker:feedback-consumer
```

## 🧪 Tests

```bash
# Unit tests
npm test

# E2E tests (Cypress)
npm run test:e2e
```

### Exemple test

```typescript
test("create feedback closes queue and emits event", async () => {
  const pred = await insertMockPrediction();
  const token = getReviewerToken();
  const res = await request(app)
    .post("/api/sira/feedback")
    .set("Authorization", `Bearer ${token}`)
    .send({ prediction_id: pred.id, label: "fraud" });
  
  expect(res.status).toBe(200);
  const { rows } = await pool.query(
    "SELECT * FROM sira_feedback WHERE prediction_id=$1", 
    [pred.id]
  );
  expect(rows.length).toBe(1);
});
```

## 📊 Observabilité & SLOs

### Métriques Prometheus

- `sira_feedback_created_total` - Total feedback créés
- `sira_explain_cache_hit_total` - Cache hits
- `sira_explain_latency_seconds` - Latence explain (P95 < 200ms)
- `sira_feedback_write_latency_seconds` - Latence write (P95 < 100ms)

### SLOs

- **UI P50 page load** : < 100ms (small lists)
- **API infer/explain queries P95** : < 200ms
- **Feedback write P95** : < 100ms

### Alerts

- Spike in `label=fraud` proportion → Review model canary
- Explain cache hit rate < 80% → Check explainer service
- Feedback backlog > 100 → Scale reviewers

## 🔐 Sécurité & Compliance

- ✅ **Evidence scanning** : Malware scan avant stockage long terme
- ✅ **PII redaction** : Redaction automatique dans comments/evidence
- ✅ **Audit immuable** : Toutes actions dans `molam_audit_logs` (append-only)
- ✅ **Multi-signature** : Cryptographic signatures pour overrides
- ✅ **Tenant scoping** : Isolation par country/legal entity
- ✅ **RBAC** : Roles (sira_reviewer, pay_admin, auditor)

## 🔗 Intégrations

### Services requis

- **SIRA Explain Service** : `/explain` endpoint (SHAP computation)
- **Kafka** : Topics `sira.feedback.created`
- **AWS S3** : Evidence storage bucket
- **Molam ID** : JWT authentication

### Briques liées

- **Brique 73** : SIRA model predictions
- **Brique 115** : Retraining pipeline (training dataset)
- **Brique 68** : RBAC & permissions

## 📝 Runbook

### Déploiement Staging

1. Deploy API & UI to staging
2. Ensure Molam ID auth integrated
3. Seed sample predictions
4. Test explainability rendering
5. Create test feedback → verify Kafka events
6. Enable worker → validate training table inserts

### Production Rollout

1. **Phase 1** : Small reviewer team (5 reviewers)
2. **Phase 2** : Expand to 20 reviewers (1 week)
3. **Phase 3** : Full rollout (monitor SLOs)

### Tuning

- Adjust explain cache TTL
- Tune Kafka consumer batch size
- Optimize DB queries (indexes)
- Scale explainer service if latency high

## 📄 License

ISC

## 👥 Contact

Molam Team - [GitHub](https://github.com/Molam-git)

---

**Status**: ✅ Complete - Ready for staging deployment  
**Version**: 1.0.0  
**Dependencies**: PostgreSQL 12+, Node.js 18+, Kafka, AWS S3, SIRA Explain Service

