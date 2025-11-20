# TODO List - Molam Connect - Implémentation des Briques
## Priorités d'Implémentation et Guide Technique

---

## 📋 Légende des Priorités

- **P0** - Critique : Infrastructure de base, bloquant pour toutes les autres briques
- **P1** - Haute : Fonctionnalités core business, essentielles pour le MVP
- **P2** - Moyenne : Améliorations importantes, nécessaires pour la production
- **P3** - Basse : Optimisations, AI avancé, features "nice-to-have"

---

## 🎯 PHASE 1 : FONDATIONS CRITIQUES (P0)

### ✅ Brique 41 - Connect Core
**Statut** : ✅ Schema SQL créé
**Priorité** : P0
**Description** : API Core, authentification, gestion des comptes marchands

**Back-End à implémenter** :
```typescript
// src/routes/connect-core.ts
- POST /api/v1/accounts (créer compte marchand)
- GET /api/v1/accounts/:id (obtenir compte)
- PUT /api/v1/accounts/:id (mettre à jour)
- POST /api/v1/auth/login (authentification)
- POST /api/v1/auth/refresh (refresh token)
```

**Front-End à implémenter** :
```typescript
// src/components/accounts/
- AccountSetupWizard.tsx (onboarding marchand)
- AccountDashboard.tsx (vue d'ensemble)
- AccountSettings.tsx (paramètres)
```

**Services requis** :
- Service d'authentification JWT
- Service de gestion des comptes
- Middleware d'autorisation

---

### ✅ Brique 42 - Connect Payments + Webhooks
**Statut** : ✅ Schema SQL créé
**Priorité** : P0
**Description** : Gestion des paiements et système de webhooks

**Back-End à implémenter** :
```typescript
// src/routes/payments.ts
- POST /api/v1/payments (créer paiement)
- GET /api/v1/payments/:id (statut paiement)
- POST /api/v1/payments/:id/capture (capturer)
- POST /api/v1/payments/:id/cancel (annuler)

// src/services/webhook-delivery.ts
- Système de queue pour webhooks (Bull/BullMQ)
- Retry logic avec backoff exponentiel
- Signature HMAC pour sécurité
```

**Front-End à implémenter** :
```typescript
// src/components/payments/
- PaymentsList.tsx (liste des transactions)
- PaymentDetails.tsx (détails d'un paiement)
- WebhookEndpoints.tsx (gestion endpoints)
- WebhookLogs.tsx (logs de livraison)
```

**Workers requis** :
- webhook-delivery-worker.ts (traitement asynchrone)

---

### ✅ Brique 68 - RBAC (Role-Based Access Control)
**Statut** : ✅ Schema SQL créé
**Priorité** : P0
**Description** : Contrôle d'accès basé sur les rôles

**Back-End à implémenter** :
```typescript
// src/middleware/rbac.ts
- requireRole(['admin', 'ops'])
- requirePermission('payments:read')
- checkResourceOwnership()

// src/routes/rbac.ts
- POST /api/v1/roles (créer rôle)
- POST /api/v1/users/:id/roles (assigner rôle)
- GET /api/v1/permissions (lister permissions)
```

**Front-End à implémenter** :
```typescript
// src/components/rbac/
- RoleManager.tsx (gestion des rôles)
- PermissionsMatrix.tsx (matrice permissions)
- UserRoles.tsx (rôles utilisateur)

// src/hooks/
- usePermissions.ts (hook pour vérifier permissions)
- useRBAC.ts (hook pour contrôle d'accès)
```

---

## 🚀 PHASE 2 : CORE BUSINESS (P1)

### ✅ Brique 43 - Checkout Orchestration
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Orchestration du processus de checkout

**Back-End à implémenter** :
```typescript
// src/services/checkout-orchestrator.ts
- Gestion des sessions de checkout
- Validation des cartes
- Routing vers PSP approprié

// src/routes/checkout.ts
- POST /api/v1/checkout/sessions (créer session)
- POST /api/v1/checkout/sessions/:id/complete
- GET /api/v1/checkout/sessions/:id/status
```

**Front-End à implémenter** :
```typescript
// src/components/checkout/
- CheckoutForm.tsx (formulaire principal)
- CardInput.tsx (saisie carte sécurisée)
- CheckoutProgress.tsx (étapes du checkout)
- PaymentMethods.tsx (sélection méthode)
```

---

### ✅ Brique 44 - Fraud Detection
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Détection de fraude en temps réel

**Back-End à implémenter** :
```typescript
// src/services/fraud-detection.ts
- Scoring de risque (0-100)
- Règles configurables
- Machine learning pour patterns

// src/routes/fraud.ts
- POST /api/v1/fraud/score (scorer une transaction)
- GET /api/v1/fraud/rules (lister règles)
- POST /api/v1/fraud/rules (créer règle)
```

**Front-End à implémenter** :
```typescript
// src/components/fraud/
- FraudDashboard.tsx (tableau de bord fraude)
- RiskScoreIndicator.tsx (indicateur de risque)
- FraudRulesEditor.tsx (éditeur de règles)
- FraudAlerts.tsx (alertes temps réel)
```

---

### ✅ Brique 48 - Radar (Risk Assessment)
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Évaluation avancée des risques

**Back-End à implémenter** :
```typescript
// src/services/radar.ts
- Analyse comportementale
- Détection d'anomalies
- Profiling des utilisateurs

// src/routes/radar.ts
- GET /api/v1/radar/risk-profile/:userId
- POST /api/v1/radar/analyze
- GET /api/v1/radar/insights
```

**Front-End à implémenter** :
```typescript
// src/components/radar/
- RadarDashboard.tsx (vue d'ensemble risques)
- RiskProfile.tsx (profil de risque)
- AnomalyAlerts.tsx (alertes anomalies)
- RadarInsights.tsx (insights ML)
```

---

### ✅ Brique 51 - Refunds & Reversals + Policies & Zones
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Gestion des remboursements avec politiques

**Back-End à implémenter** :
```typescript
// src/routes/refunds.ts
- POST /api/v1/refunds (créer remboursement)
- POST /api/v1/refunds/:id/approve (approuver)
- GET /api/v1/refunds/:id (statut)

// src/services/refund-policies.ts
- Validation des politiques par zone
- Auto-approval selon règles
- Calcul des frais
```

**Front-End à implémenter** :
```typescript
// src/components/refunds/
- RefundRequestForm.tsx (demande remboursement)
- RefundsList.tsx (liste remboursements)
- RefundPolicies.tsx (politiques configurables)
- RefundApproval.tsx (workflow d'approbation)
```

---

### ✅ Brique 52 - Subscriptions
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Paiements récurrents et abonnements

**Back-End à implémenter** :
```typescript
// src/routes/subscriptions.ts
- POST /api/v1/subscriptions (créer abonnement)
- PUT /api/v1/subscriptions/:id (modifier)
- POST /api/v1/subscriptions/:id/cancel (annuler)
- POST /api/v1/subscriptions/:id/pause (mettre en pause)

// src/workers/subscription-billing.ts
- Facturation automatique périodique
- Gestion des échecs de paiement
- Retry logic intelligent
```

**Front-End à implémenter** :
```typescript
// src/components/subscriptions/
- SubscriptionPlans.tsx (liste des plans)
- SubscriptionForm.tsx (création/modification)
- SubscriptionStatus.tsx (statut et historique)
- BillingHistory.tsx (historique facturation)
```

---

### ✅ Brique 60 - Recurring Billing
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Facturation récurrente avancée

**Back-End à implémenter** :
```typescript
// src/services/recurring-billing.ts
- Calcul prorata
- Gestion des upgrades/downgrades
- Facturation par usage (metered)

// src/workers/billing-processor.ts
- Génération des invoices
- Envoi des notifications
- Gestion des impayés
```

**Front-End à implémenter** :
```typescript
// src/components/billing/
- InvoicesList.tsx (liste factures)
- InvoiceDetails.tsx (détail facture)
- UsageMetrics.tsx (métriques d'usage)
- BillingSettings.tsx (paramètres facturation)
```

---

### ✅ Brique 64 - Split Payments
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Paiements fractionnés pour marketplaces

**Back-End à implémenter** :
```typescript
// src/routes/split-payments.ts
- POST /api/v1/payments/split (créer paiement fractionné)
- GET /api/v1/split-payments/:id/recipients

// src/services/split-calculator.ts
- Calcul des parts (%, fixe, mixte)
- Gestion des frais par partie
- Validation des montants
```

**Front-End à implémenter** :
```typescript
// src/components/split-payments/
- SplitPaymentForm.tsx (configuration split)
- RecipientsManager.tsx (gestion bénéficiaires)
- SplitVisualization.tsx (visualisation des parts)
```

---

### ✅ Brique 65 - Tax Engine
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Calcul automatique des taxes

**Back-End à implémenter** :
```typescript
// src/services/tax-calculator.ts
- Calcul TVA par pays/région
- Gestion des seuils de franchise
- Support multi-juridictions

// src/routes/tax.ts
- POST /api/v1/tax/calculate
- GET /api/v1/tax/rates (taux par région)
- POST /api/v1/tax/configuration
```

**Front-End à implémenter** :
```typescript
// src/components/tax/
- TaxConfiguration.tsx (configuration des taxes)
- TaxRatesTable.tsx (tableau des taux)
- TaxReports.tsx (rapports fiscaux)
```

---

### ✅ Brique 71 - KYC (Know Your Customer)
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Vérification d'identité

**Back-End à implémenter** :
```typescript
// src/routes/kyc.ts
- POST /api/v1/kyc/submit (soumettre documents)
- GET /api/v1/kyc/status/:userId
- POST /api/v1/kyc/verify (vérification manuelle)

// src/services/kyc-verification.ts
- Intégration avec fournisseurs KYC (Onfido, Jumio)
- Validation automatique des documents
- OCR pour extraction de données
```

**Front-End à implémenter** :
```typescript
// src/components/kyc/
- KYCForm.tsx (formulaire soumission)
- DocumentUpload.tsx (upload documents)
- KYCStatus.tsx (statut vérification)
- KYCReview.tsx (revue manuelle par ops)
```

---

## 🔧 PHASE 3 : FONCTIONNALITÉS AVANCÉES (P2)

### ✅ Brique 55/58/66 - Disputes (Chargebacks)
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Gestion des litiges et chargebacks

**Back-End à implémenter** :
```typescript
// src/routes/disputes.ts
- POST /api/v1/disputes (créer dispute)
- POST /api/v1/disputes/:id/evidence (soumettre preuves)
- PUT /api/v1/disputes/:id/respond (répondre)

// src/services/dispute-manager.ts
- Workflow de gestion des disputes
- Notifications automatiques
- Suivi des délais
```

**Front-End à implémenter** :
```typescript
// src/components/disputes/
- DisputesList.tsx (liste des litiges)
- DisputeDetails.tsx (détails + timeline)
- EvidenceUpload.tsx (upload preuves)
- DisputeResponse.tsx (formulaire réponse)
```

---

### ✅ Brique 69 - Analytics & Reporting
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Analytics et rapports avancés

**Back-End à implémenter** :
```typescript
// src/routes/analytics.ts
- GET /api/v1/analytics/dashboard (métriques)
- GET /api/v1/analytics/revenue (revenus)
- GET /api/v1/analytics/transactions (analyses)
- POST /api/v1/reports/generate

// src/services/analytics-aggregator.ts
- Agrégation temps réel
- Calcul de KPIs
- Génération de rapports
```

**Front-End à implémenter** :
```typescript
// src/components/analytics/
- AnalyticsDashboard.tsx (dashboard principal)
- RevenueChart.tsx (graphique revenus)
- TransactionMetrics.tsx (métriques transactions)
- CustomReportBuilder.tsx (builder de rapports)
```

---

### ✅ Brique 70-70octies - Marketing & AI Campaigns
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Suite marketing avec IA

**Back-End à implémenter** :
```typescript
// src/routes/marketing.ts
- POST /api/v1/campaigns (créer campagne)
- GET /api/v1/campaigns/:id/stats
- POST /api/v1/campaigns/:id/send

// src/services/ai-marketing.ts
- Segmentation automatique
- Prédiction de churn
- Recommandations de prix (AI)
- Optimisation de campagnes
```

**Front-End à implémenter** :
```typescript
// src/components/marketing/
- CampaignBuilder.tsx (création campagnes)
- SegmentationEditor.tsx (segments clients)
- AIInsights.tsx (recommandations IA)
- CampaignAnalytics.tsx (performances)
```

---

### ✅ Brique 72 - Limits Management
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Gestion des limites de transaction

**Back-End à implémenter** :
```typescript
// src/middleware/limits.ts
- Vérification des limites avant transaction
- Limites par période (jour/semaine/mois)
- Limites par type d'opération

// src/routes/limits.ts
- GET /api/v1/limits/:userId
- PUT /api/v1/limits/:userId (modifier limites)
- GET /api/v1/limits/:userId/usage
```

**Front-End à implémenter** :
```typescript
// src/components/limits/
- LimitsConfiguration.tsx (config limites)
- UsageMonitor.tsx (monitoring utilisation)
- LimitsAlerts.tsx (alertes dépassement)
```

---

### ✅ Brique 73 - Dev Console + Webhooks
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Console développeur et gestion webhooks

**Back-End à implémenter** :
```typescript
// src/routes/dev-console.ts
- POST /api/v1/api-keys (générer clé API)
- GET /api/v1/api-keys (lister clés)
- DELETE /api/v1/api-keys/:id
- POST /api/v1/webhooks/test (tester webhook)
```

**Front-End à implémenter** :
```typescript
// src/components/dev-console/
- APIKeysManager.tsx (gestion clés API)
- WebhookTester.tsx (test webhooks)
- APIDocumentation.tsx (docs interactives)
- RequestLogs.tsx (logs de requêtes)
```

---

### ✅ Brique 80 - Rate Limits
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Rate limiting avancé

**Back-End à implémenter** :
```typescript
// src/middleware/rate-limiter.ts
- Algorithme sliding window
- Rate limiting par endpoint
- Rate limiting par API key

// src/services/rate-limit-redis.ts
- Stockage des compteurs dans Redis
- Stratégies de throttling
```

**Front-End à implémenter** :
```typescript
// src/components/rate-limits/
- RateLimitConfig.tsx (configuration)
- RateLimitMonitor.tsx (monitoring temps réel)
- ThrottlingAlerts.tsx (alertes)
```

---

### ✅ Brique 86 - Statement Reconciliation
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Réconciliation bancaire automatique

**Back-End à implémenter** :
```typescript
// src/services/reconciliation.ts
- Import des relevés bancaires (CSV, PDF)
- Matching automatique des transactions
- Détection des écarts

// src/routes/reconciliation.ts
- POST /api/v1/reconciliation/import
- GET /api/v1/reconciliation/unmatched
- POST /api/v1/reconciliation/match
```

**Front-End à implémenter** :
```typescript
// src/components/reconciliation/
- StatementUpload.tsx (upload relevés)
- ReconciliationBoard.tsx (tableau réconciliation)
- UnmatchedTransactions.tsx (transactions non matchées)
- ReconciliationReports.tsx (rapports)
```

---

### ✅ Brique 90 - Compliance & AML
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Anti-Money Laundering

**Back-End à implémenter** :
```typescript
// src/services/aml-screening.ts
- Screening des listes de sanctions
- Détection des patterns suspects
- Scoring de risque AML

// src/routes/compliance.ts
- POST /api/v1/compliance/screen
- GET /api/v1/compliance/alerts
- POST /api/v1/compliance/case (créer dossier)
```

**Front-End à implémenter** :
```typescript
// src/components/compliance/
- AMLDashboard.tsx (tableau de bord)
- AlertsQueue.tsx (file d'alertes)
- CaseManagement.tsx (gestion des dossiers)
- ComplianceReports.tsx (rapports réglementaires)
```

---

### ✅ Brique 94 - Molam Form Core
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Formulaires personnalisables

**Back-End à implémenter** :
```typescript
// src/routes/forms.ts
- POST /api/v1/forms (créer formulaire)
- GET /api/v1/forms/:id
- POST /api/v1/forms/:id/submit (soumettre)
- GET /api/v1/forms/:id/responses

// src/services/form-builder.ts
- Générateur de schéma JSON
- Validation dynamique
- Logique conditionnelle
```

**Front-End à implémenter** :
```typescript
// src/components/forms/
- FormBuilder.tsx (builder drag-and-drop)
- FormRenderer.tsx (rendu dynamique)
- FormResponses.tsx (réponses)
- FormAnalytics.tsx (analytics)
```

---

### ✅ Brique 97 - Tokenization
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Tokenization des cartes bancaires

**Back-End à implémenter** :
```typescript
// src/services/tokenization.ts
- Création de tokens PCI-compliant
- Détokenization sécurisée
- Gestion du cycle de vie des tokens

// src/routes/tokens.ts
- POST /api/v1/tokens (créer token)
- GET /api/v1/tokens/:id
- DELETE /api/v1/tokens/:id
```

**Front-End à implémenter** :
```typescript
// src/components/tokenization/
- TokenizedCardInput.tsx (input sécurisé)
- SavedCards.tsx (cartes enregistrées)
- TokenManagement.tsx (gestion tokens)
```

---

## 🤖 PHASE 4 : IA ET OPTIMISATIONS (P2-P3)

### ✅ Brique 95 - Auto-Switch Routing
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Routing intelligent automatique

**Back-End à implémenter** :
```typescript
// src/services/smart-router.ts
- Sélection PSP basée sur performance
- Failover automatique
- A/B testing de routes

// src/routes/routing.ts
- GET /api/v1/routing/rules
- POST /api/v1/routing/rules (créer règle)
- GET /api/v1/routing/performance
```

**Front-End à implémenter** :
```typescript
// src/components/routing/
- RoutingDashboard.tsx (monitoring routes)
- RoutingRules.tsx (configuration règles)
- PSPPerformance.tsx (performances PSP)
- FailoverLogs.tsx (logs failover)
```

---

### ✅ Brique 116-116septies - SIRA Routing Suite
**Statut** : ✅ Schema SQL créé
**Priorité** : P2-P3
**Description** : Suite complète de routing IA

**Back-End à implémenter** :
```typescript
// src/sira/routing-engine.ts
- Modèles ML pour prédiction succès
- A/B testing automatique
- Détection d'anomalies
- Routing adaptatif

// src/routes/sira-routing.ts
- POST /api/v1/sira/predict (prédiction)
- GET /api/v1/sira/experiments (A/B tests)
- GET /api/v1/sira/anomalies
```

**Front-End à implémenter** :
```typescript
// src/components/sira/
- SIRADashboard.tsx (vue d'ensemble)
- ExperimentManager.tsx (gestion A/B tests)
- AnomalyAlerts.tsx (alertes)
- RoutingSimulator.tsx (simulateur)
- PredictiveInsights.tsx (insights prédictifs)
```

---

### ✅ Brique 119 - Bank Profiles & Treasury Accounts
**Statut** : ✅ Schema SQL créé
**Priorité** : P1
**Description** : Gestion des profils bancaires et comptes trésorerie

**Back-End à implémenter** :
```typescript
// src/routes/banks.ts
- POST /api/v1/banks/onboard (onboarding banque)
- GET /api/v1/banks (liste banques)
- POST /api/v1/treasury-accounts (créer compte)
- GET /api/v1/banks/:id/sla (SLA tracking)

// src/services/bank-sla-tracker.ts
- Monitoring SLA temps réel
- Alertes dépassement
- Rapports de performance
```

**Front-End à implémenter** :
```typescript
// src/components/banks/
- BankOnboarding.tsx (wizard onboarding)
- BanksList.tsx (liste banques)
- TreasuryAccounts.tsx (comptes trésorerie)
- SLADashboard.tsx (monitoring SLA)
- BankCertifications.tsx (certifications)
```

---

### ✅ Brique 120-120ter - Payouts Suite
**Statut** : ✅ Schema SQL créé
**Priorité** : P1-P2
**Description** : Moteur de payouts industriel

**Back-End à implémenter** :
```typescript
// src/routes/payouts.ts
- POST /api/v1/payouts (créer payout)
- POST /api/v1/payouts/batch (batch payouts)
- GET /api/v1/payouts/:id/status

// src/routes/marketplace-payouts.ts
- POST /api/v1/marketplaces/:id/sellers (créer seller)
- POST /api/v1/marketplaces/:id/payouts (smart payout)
- GET /api/v1/sellers/:id/balance

// src/workers/payout-processor.ts
- Traitement batch des payouts
- Retry logic avec backoff
- Slice execution multi-banques

// src/sira/payout-optimizer.ts
- Recommandations SIRA pour routing
- Gestion des escrows
- Calcul des advances
```

**Front-End à implémenter** :
```typescript
// src/components/payouts/
- PayoutsQueue.tsx (file de payouts)
- BatchPayouts.tsx (création batch)
- PayoutStatus.tsx (suivi statut)

// src/components/marketplace/
- SellersList.tsx (gestion sellers)
- SellerBalance.tsx (balance seller)
- SmartPayoutForm.tsx (payout intelligent)
- EscrowManager.tsx (gestion escrows)
- AdvancesCalculator.tsx (avances)
```

---

### ✅ Brique 138 - AI Float Optimizer
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Optimisation IA de la trésorerie

**Back-End à implémenter** :
```typescript
// src/sira/float-optimizer.ts
- Prédiction des flux de trésorerie
- Recommandations de transferts inter-banques
- Optimisation des coûts

// src/routes/float-optimizer.ts
- GET /api/v1/float/recommendations
- POST /api/v1/float/execute
- GET /api/v1/float/forecast
```

**Front-End à implémenter** :
```typescript
// src/components/float/
- FloatDashboard.tsx (vue trésorerie)
- FloatForecast.tsx (prévisions)
- RebalancingRecommendations.tsx (recommandations)
- FloatOptimizationHistory.tsx (historique)
```

---

## 🔐 PHASE 5 : SÉCURITÉ & OPS (P2)

### ✅ Brique 106 - Auth Decisions & OTP
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Authentification avancée et OTP

**Back-End à implémenter** :
```typescript
// src/services/auth-service.ts
- Génération OTP (SMS, Email, Authenticator)
- Vérification 2FA
- Session management

// src/routes/auth.ts
- POST /api/v1/auth/otp/send
- POST /api/v1/auth/otp/verify
- POST /api/v1/auth/2fa/enable
```

**Front-End à implémenter** :
```typescript
// src/components/auth/
- OTPInput.tsx (saisie OTP)
- TwoFactorSetup.tsx (setup 2FA)
- AuthenticationFlow.tsx (flow complet)
```

---

### ✅ Brique 134 - Ops Controls
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Contrôles opérationnels

**Back-End à implémenter** :
```typescript
// src/routes/ops-controls.ts
- POST /api/v1/ops/controls (créer contrôle)
- PUT /api/v1/ops/controls/:id (activer/désactiver)
- GET /api/v1/ops/controls/active

// src/middleware/ops-controls.ts
- Vérification des feature flags
- Circuit breakers
- Emergency shutdown
```

**Front-End à implémenter** :
```typescript
// src/components/ops/
- OpsControlPanel.tsx (panneau de contrôle)
- FeatureFlags.tsx (feature flags)
- CircuitBreakers.tsx (circuit breakers)
- EmergencyControls.tsx (contrôles urgence)
```

---

### ✅ Brique 135 - Approvals Service
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Workflow d'approbations

**Back-End à implémenter** :
```typescript
// src/services/approval-workflow.ts
- Création de workflows d'approbation
- Notifications aux approbateurs
- Escalation automatique

// src/routes/approvals.ts
- POST /api/v1/approvals (créer demande)
- POST /api/v1/approvals/:id/approve
- POST /api/v1/approvals/:id/reject
- GET /api/v1/approvals/pending
```

**Front-End à implémenter** :
```typescript
// src/components/approvals/
- ApprovalQueue.tsx (file d'approbations)
- ApprovalDetails.tsx (détails demande)
- ApprovalWorkflow.tsx (configuration workflow)
- MyApprovals.tsx (mes approbations)
```

---

### ✅ Brique 136 - Notifications & Multi-channel
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Système de notifications multi-canal

**Back-End à implémenter** :
```typescript
// src/services/notification-dispatcher.ts
- Envoi Email (SendGrid, AWS SES)
- Envoi SMS (Twilio, AWS SNS)
- Push notifications (Firebase)
- Webhooks

// src/routes/notifications.ts
- POST /api/v1/notifications/send
- GET /api/v1/notifications/templates
- POST /api/v1/notifications/templates
```

**Front-End à implémenter** :
```typescript
// src/components/notifications/
- NotificationCenter.tsx (centre notifications)
- NotificationPreferences.tsx (préférences)
- TemplateEditor.tsx (éditeur templates)
- NotificationHistory.tsx (historique)
```

---

## 🎨 PHASE 6 : EXPÉRIENCE UTILISATEUR (P2-P3)

### ✅ Brique 108 - PaymentIntent & 3DS2
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : 3D Secure 2.0 orchestration

**Back-End à implémenter** :
```typescript
// src/services/three-ds.ts
- Gestion du flow 3DS2
- Challenge handling
- Frictionless flow

// src/routes/payment-intents.ts
- POST /api/v1/payment-intents
- POST /api/v1/payment-intents/:id/confirm
- POST /api/v1/payment-intents/:id/challenge
```

**Front-End à implémenter** :
```typescript
// src/components/3ds/
- ThreeDSChallenge.tsx (challenge 3DS)
- PaymentIntentFlow.tsx (flow complet)
- ThreeDSIndicator.tsx (indicateur statut)
```

---

### ✅ Brique 109 - Checkout Widgets & SDK
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Widgets de checkout

**Back-End à implémenter** :
```typescript
// src/routes/widgets.ts
- GET /api/v1/widgets/:id/config
- POST /api/v1/widgets/:id/session

// SDK JavaScript
// dist/molam-checkout.js
- MolamCheckout.init()
- MolamCheckout.createPaymentForm()
- MolamCheckout.handlePayment()
```

**Front-End à implémenter** :
```typescript
// src/widgets/
- CheckoutWidget.tsx (widget principal)
- PaymentFormWidget.tsx (formulaire)
- StatusWidget.tsx (statut paiement)

// SDK côté marchand
<script src="https://cdn.molam.com/checkout.js"></script>
<div id="molam-checkout"></div>
```

---

### ✅ Brique 137 - Merchant Dashboard
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Dashboard marchand complet

**Front-End à implémenter** :
```typescript
// src/pages/merchant/
- DashboardHome.tsx (accueil)
- TransactionsPage.tsx (transactions)
- ReportsPage.tsx (rapports)
- SettingsPage.tsx (paramètres)
- IntegrationsPage.tsx (intégrations)

// src/components/dashboard/
- RevenueChart.tsx (graphique revenus)
- TransactionsList.tsx (liste transactions)
- QuickStats.tsx (stats rapides)
- RecentActivity.tsx (activité récente)
```

---

### ✅ Brique 140 - Developer Portal (AI-Powered)
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Portail développeur avec IA

**Back-End à implémenter** :
```typescript
// src/routes/dev-portal.ts
- POST /api/v1/dev-portal/ask (assistant IA)
- POST /api/v1/dev-portal/debug (auto-debug)
- POST /api/v1/dev-portal/simulate

// src/services/ai-assistant.ts
- Assistant IA pour documentation
- Suggestions de code
- Debugging automatique
```

**Front-End à implémenter** :
```typescript
// src/components/dev-portal/
- DeveloperDocs.tsx (docs interactives)
- AIAssistant.tsx (chat IA)
- CodePlayground.tsx (playground)
- APISimulator.tsx (simulateur)
- AutoDebugger.tsx (debugger auto)
```

---

### ✅ Brique 141 - Ops UI
**Statut** : ✅ Schema SQL créé
**Priorité** : P2
**Description** : Interface opérations

**Front-End à implémenter** :
```typescript
// src/pages/ops/
- OpsHome.tsx (accueil ops)
- HealthMonitor.tsx (santé système)
- IncidentManager.tsx (gestion incidents)
- MetricsDashboard.tsx (métriques)

// src/components/ops/
- ServiceHealth.tsx (santé services)
- AlertsPanel.tsx (panneau alertes)
- SystemLogs.tsx (logs système)
```

---

### ✅ Brique 143 - i18n & Accessibility
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Internationalisation et accessibilité

**Back-End à implémenter** :
```typescript
// src/services/i18n.ts
- Gestion des traductions
- Détection de langue automatique
- Traduction automatique (AI)

// src/routes/i18n.ts
- GET /api/v1/i18n/translations/:lang
- POST /api/v1/i18n/translations (créer traduction)
```

**Front-End à implémenter** :
```typescript
// src/hooks/
- useTranslation.ts (hook traduction)
- useLanguage.ts (hook langue)

// src/components/i18n/
- LanguageSwitcher.tsx (changement langue)
- TranslationEditor.tsx (éditeur)
- AccessibilitySettings.tsx (paramètres accessibilité)

// Implémentation
- Support WCAG 2.1 AA
- Screen reader friendly
- Keyboard navigation
- High contrast mode
```

---

### ✅ Brique 145 - Analytics (ClickHouse)
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Analytics avec ClickHouse

**Back-End à implémenter** :
```typescript
// src/services/clickhouse-analytics.ts
- Ingestion temps réel dans ClickHouse
- Requêtes analytiques complexes
- Agrégations performantes

// src/routes/advanced-analytics.ts
- POST /api/v1/analytics/query (requêtes custom)
- GET /api/v1/analytics/realtime
- GET /api/v1/analytics/cohorts
```

**Front-End à implémenter** :
```typescript
// src/components/analytics/
- AdvancedAnalytics.tsx (analytics avancés)
- QueryBuilder.tsx (builder de requêtes)
- RealtimeDashboard.tsx (temps réel)
- CohortAnalysis.tsx (analyse cohortes)
```

---

## 🧪 PHASE 7 : EXPÉRIMENTATION (P3)

### ✅ Brique 107 - Offline Fallback (QR + USSD)
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Paiements offline

**Back-End à implémenter** :
```typescript
// src/services/offline-payments.ts
- Génération de QR codes
- Gateway USSD
- Synchronisation différée

// src/routes/offline.ts
- POST /api/v1/offline/qr/generate
- POST /api/v1/offline/ussd/initiate
- POST /api/v1/offline/sync
```

**Front-End à implémenter** :
```typescript
// src/components/offline/
- QRPayment.tsx (paiement QR)
- USSDFlow.tsx (flow USSD)
- OfflineSync.tsx (synchronisation)
```

---

### ✅ Brique 110 - Plugin Telemetry
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Télémétrie des plugins

**Back-End à implémenter** :
```typescript
// src/services/plugin-telemetry.ts
- Collection de métriques plugins
- Détection de problèmes
- Notifications de mises à jour

// src/routes/plugins.ts
- GET /api/v1/plugins (liste plugins)
- POST /api/v1/plugins/:id/telemetry
- GET /api/v1/plugins/:id/health
```

**Front-End à implémenter** :
```typescript
// src/components/plugins/
- PluginsList.tsx (liste plugins)
- PluginHealth.tsx (santé plugin)
- PluginUpdates.tsx (mises à jour)
```

---

### ✅ Brique 147 - Experiments & A/B Testing
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Framework d'expérimentation

**Back-End à implémenter** :
```typescript
// src/services/experiments.ts
- Création d'expériences A/B/n
- Assignation de variants
- Calcul de significativité statistique

// src/routes/experiments.ts
- POST /api/v1/experiments (créer expérience)
- GET /api/v1/experiments/:id/results
- POST /api/v1/experiments/:id/conclude
```

**Front-End à implémenter** :
```typescript
// src/components/experiments/
- ExperimentBuilder.tsx (création)
- ExperimentResults.tsx (résultats)
- VariantComparison.tsx (comparaison)
- StatisticalAnalysis.tsx (analyse stats)
```

---

### ✅ Brique 149 - Wallet & Connect
**Statut** : ✅ Schema SQL créé
**Priorité** : P3
**Description** : Wallet digital et Connect

**Back-End à implémenter** :
```typescript
// src/routes/wallet.ts
- POST /api/v1/wallets (créer wallet)
- POST /api/v1/wallets/:id/topup (recharger)
- POST /api/v1/wallets/:id/transfer (transfert)
- GET /api/v1/wallets/:id/balance

// src/routes/connect.ts
- POST /api/v1/connect/link (lier compte)
- GET /api/v1/connect/accounts
```

**Front-End à implémenter** :
```typescript
// src/components/wallet/
- WalletDashboard.tsx (dashboard wallet)
- TopUpForm.tsx (rechargement)
- TransferForm.tsx (transfert)
- TransactionHistory.tsx (historique)

// src/components/connect/
- AccountLinker.tsx (liaison comptes)
- ConnectedAccounts.tsx (comptes liés)
```

---

## 🗂️ BRIQUES MANQUANTES À CRÉER

Les briques suivantes sont référencées dans le système mais n'ont pas encore de schema SQL :

### ⚠️ Brique 63 - MANQUANTE
**Priorité** : P2
**Description estimée** : Probablement liée aux analytics ou merchant tools

### ⚠️ Brique 96 - MANQUANTE
**Priorité** : P2
**Description estimée** : Probablement liée aux payouts ou routing

### ⚠️ Briques 100-103 - MANQUANTES
**Priorité** : P2
**Description estimée** : Potentiellement des extensions ou modules avancés

### ⚠️ Brique 111 (non 111-2) - MANQUANTE
**Priorité** : P3
**Description estimée** : Config ou SIRA related

### ⚠️ Brique 114 - MANQUANTE
**Priorité** : P3
**Description estimée** : Probablement SIRA related

### ⚠️ Brique 115 (non 115bis/ter) - MANQUANTE
**Priorité** : P3
**Description estimée** : Deployment ou rollback related

### ⚠️ Brique 146 - MANQUANTE
**Priorité** : P3
**Description estimée** : Probablement analytics ou experiments related

### ⚠️ Brique 148 - MANQUANTE
**Priorité** : P3
**Description estimée** : Probablement wallet ou connect related

---

## 📊 RÉSUMÉ PAR PHASE

### Phase 1 - Fondations (P0) : 3 briques
- Brique 41 : Connect Core
- Brique 42 : Connect Payments + Webhooks
- Brique 68 : RBAC

### Phase 2 - Core Business (P1) : 12 briques
- Briques 43, 44, 48, 51, 52, 60, 64, 65, 71, 119, 120

### Phase 3 - Avancé (P2) : 20+ briques
- Briques 55/58/66, 69, 70-série, 72, 73, 80, 86, 90, 94, 97, 106, 134, 135, 136, 137, 140, 141

### Phase 4 - IA & Optimisation (P2-P3) : 10+ briques
- Briques 95, 116-série (7 briques), 138

### Phase 5 - Sécurité & Ops (P2) : déjà couvert ci-dessus

### Phase 6 - UX (P2-P3) : 5+ briques
- Briques 108, 109, 143, 145

### Phase 7 - Expérimentation (P3) : 4 briques
- Briques 107, 110, 147, 149

---

## 🚀 ORDRE D'IMPLÉMENTATION RECOMMANDÉ

1. **SEMAINE 1-2** : Phase 1 (P0) - Infrastructure de base
2. **SEMAINE 3-6** : Phase 2 (P1) - Core business critical
3. **SEMAINE 7-10** : Phase 3 (P2) - Fonctionnalités avancées
4. **SEMAINE 11-12** : Phase 4 (P2-P3) - IA et optimisations
5. **SEMAINE 13-14** : Phase 6 (P2-P3) - Expérience utilisateur
6. **SEMAINE 15+** : Phase 7 (P3) - Expérimentation et innovation

---

## 🛠️ STACK TECHNIQUE GLOBAL

### Back-End
- **Runtime** : Node.js 20+ avec TypeScript
- **Framework** : Express.js
- **ORM** : Prisma
- **Database** : PostgreSQL 15+
- **Cache** : Redis
- **Queue** : BullMQ
- **Analytics** : ClickHouse (brique 145)
- **AI/ML** : Python (SIRA components)

### Front-End
- **Framework** : React 18+ avec TypeScript
- **State Management** : Zustand ou Redux Toolkit
- **UI Library** : Material-UI ou Tailwind CSS + shadcn/ui
- **Forms** : React Hook Form + Zod
- **Charts** : Recharts ou Chart.js
- **Tables** : TanStack Table (React Table v8)

### DevOps
- **Containerization** : Docker + Docker Compose
- **Orchestration** : Kubernetes (production)
- **CI/CD** : GitHub Actions
- **Monitoring** : Prometheus + Grafana
- **Logging** : ELK Stack ou Loki
- **Tracing** : Jaeger ou Tempo

### Security
- **Authentication** : JWT + Refresh tokens
- **Authorization** : RBAC (brique 68)
- **Encryption** : AES-256 pour données sensibles
- **PCI Compliance** : Tokenization (brique 97)
- **2FA** : OTP via SMS/Email/Authenticator (brique 106)

---

## 📝 NOTES D'IMPLÉMENTATION

### Patterns Communs

**1. Structure API Standard**
```typescript
// src/routes/{resource}.ts
router.post('/api/v1/{resource}', authenticate, authorize(['role']), validate(schema), handler);
```

**2. Structure de Service**
```typescript
// src/services/{resource}-service.ts
export class ResourceService {
  async create(data: CreateDTO): Promise<Resource> { }
  async findById(id: string): Promise<Resource | null> { }
  async update(id: string, data: UpdateDTO): Promise<Resource> { }
  async delete(id: string): Promise<void> { }
}
```

**3. Structure de Component React**
```typescript
// src/components/{feature}/{Component}.tsx
export const Component: React.FC<Props> = ({ prop1, prop2 }) => {
  const [state, setState] = useState();

  useEffect(() => { }, []);

  return <div>...</div>;
};
```

### Conventions de Nommage
- **Routes API** : kebab-case (`/api/v1/payment-intents`)
- **Fichiers** : kebab-case (`payment-service.ts`)
- **Components** : PascalCase (`PaymentForm.tsx`)
- **Functions** : camelCase (`createPayment`)
- **Constants** : UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

### Tests
- **Unit Tests** : Jest pour backend, Jest + React Testing Library pour frontend
- **Integration Tests** : Supertest pour API, Cypress pour E2E
- **Coverage Target** : 80%+ pour code critique

---

## ✅ CHECKLIST PAR BRIQUE

Pour chaque brique implémentée, vérifier :

- [ ] Schema SQL créé et migré
- [ ] Prisma schema généré
- [ ] Routes API implémentées
- [ ] Services métier créés
- [ ] Middleware de sécurité appliqués
- [ ] Validation des inputs (Zod)
- [ ] Tests unitaires écrits (80%+ coverage)
- [ ] Tests d'intégration écrits
- [ ] Components React créés
- [ ] State management configuré
- [ ] Hooks personnalisés créés
- [ ] Documentation API (OpenAPI)
- [ ] Documentation utilisateur
- [ ] Logs et monitoring ajoutés
- [ ] Gestion d'erreurs complète
- [ ] Rate limiting configuré
- [ ] RBAC permissions définies
- [ ] Validation sécurité (OWASP Top 10)
- [ ] Performance testée
- [ ] Déployé en staging
- [ ] Tests E2E passés
- [ ] Approuvé pour production

---

**Document créé le** : 2025-01-20
**Dernière mise à jour** : 2025-01-20
**Version** : 1.0
**Auteur** : Claude (Molam Connect Team)
