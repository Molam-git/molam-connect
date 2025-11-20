/**
 * Brique 118ter: Observabilité & Metrics
 * Export Prometheus pour monitoring du Playground
 */

import client from 'prom-client';
import { Request, Response } from 'express';

// Activer la collecte automatique des métriques par défaut
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
  prefix: 'molam_playground_',
  timeout: 5000
});

// Registry
export const register = client.register;

/**
 * Métrique: Nombre total de tests exécutés dans le Playground
 */
export const testRuns = new client.Counter({
  name: 'molam_playground_test_runs_total',
  help: 'Nombre de tests exécutés dans le Playground',
  labelNames: ['status', 'method', 'endpoint']
});

/**
 * Métrique: Alertes déclenchées par fuzzing/injection
 */
export const fuzzingAlerts = new client.Counter({
  name: 'molam_playground_fuzzing_alerts_total',
  help: 'Nombre d\'alertes déclenchées par fuzzing ou tentatives d\'injection',
  labelNames: ['attack_type', 'severity']
});

/**
 * Métrique: Requêtes bloquées par rate-limit
 */
export const rateLimitHits = new client.Counter({
  name: 'molam_playground_rate_limit_hits_total',
  help: 'Nombre de requêtes bloquées par rate-limit',
  labelNames: ['user_role', 'endpoint']
});

/**
 * Métrique: RBAC violations (tentatives d'accès non autorisé)
 */
export const rbacViolations = new client.Counter({
  name: 'molam_playground_rbac_violations_total',
  help: 'Nombre de violations RBAC détectées',
  labelNames: ['user_role', 'attempted_action', 'resource']
});

/**
 * Métrique: Sessions partagées créées
 */
export const sharedSessions = new client.Counter({
  name: 'molam_playground_shared_sessions_total',
  help: 'Nombre de sessions partagées créées',
  labelNames: ['ttl_category'] // short, medium, long
});

/**
 * Métrique: Sessions expirées
 */
export const expiredSessions = new client.Counter({
  name: 'molam_playground_expired_sessions_total',
  help: 'Nombre de sessions expirées nettoyées'
});

/**
 * Métrique: Durée d'exécution des requêtes sandbox
 */
export const requestDuration = new client.Histogram({
  name: 'molam_playground_request_duration_seconds',
  help: 'Durée d\'exécution des requêtes vers le sandbox',
  labelNames: ['method', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

/**
 * Métrique: Taille des payloads
 */
export const payloadSize = new client.Histogram({
  name: 'molam_playground_payload_size_bytes',
  help: 'Taille des payloads de requêtes',
  labelNames: ['method'],
  buckets: [100, 1000, 10000, 100000, 1000000]
});

/**
 * Métrique: Snippets générés
 */
export const snippetsGenerated = new client.Counter({
  name: 'molam_playground_snippets_generated_total',
  help: 'Nombre de snippets de code générés',
  labelNames: ['language'] // node, php, python, curl
});

/**
 * Métrique: Suggestions Sira générées
 */
export const siraSuggestions = new client.Counter({
  name: 'molam_playground_sira_suggestions_total',
  help: 'Nombre de suggestions Sira générées',
  labelNames: ['suggestion_type', 'severity']
});

/**
 * Métrique: Active users (gauge)
 */
export const activeUsers = new client.Gauge({
  name: 'molam_playground_active_users',
  help: 'Nombre d\'utilisateurs actifs actuellement'
});

/**
 * Métrique: Database connection pool
 */
export const dbConnections = new client.Gauge({
  name: 'molam_playground_db_connections',
  help: 'Nombre de connexions actives à la base de données',
  labelNames: ['state'] // idle, active
});

/**
 * Métrique: Memory usage
 */
export const memoryUsage = new client.Gauge({
  name: 'molam_playground_memory_usage_bytes',
  help: 'Utilisation mémoire du processus',
  labelNames: ['type'] // heapUsed, heapTotal, rss
});

/**
 * Méthode helper: Enregistrer un test run
 */
export function recordTestRun(status: 'success' | 'failure' | 'timeout', method: string, endpoint: string) {
  testRuns.labels(status, method, endpoint).inc();
}

/**
 * Méthode helper: Enregistrer une alerte fuzzing
 */
export function recordFuzzingAlert(attackType: string, severity: 'low' | 'medium' | 'high' | 'critical') {
  fuzzingAlerts.labels(attackType, severity).inc();
}

/**
 * Méthode helper: Enregistrer un rate limit hit
 */
export function recordRateLimitHit(userRole: string, endpoint: string) {
  rateLimitHits.labels(userRole, endpoint).inc();
}

/**
 * Méthode helper: Enregistrer une violation RBAC
 */
export function recordRBACViolation(userRole: string, attemptedAction: string, resource: string) {
  rbacViolations.labels(userRole, attemptedAction, resource).inc();
}

/**
 * Méthode helper: Enregistrer une session partagée
 */
export function recordSharedSession(ttlSeconds: number) {
  let category = 'long'; // > 7 days
  if (ttlSeconds < 3600) category = 'short'; // < 1 hour
  else if (ttlSeconds < 604800) category = 'medium'; // < 7 days

  sharedSessions.labels(category).inc();
}

/**
 * Méthode helper: Enregistrer une durée de requête
 */
export function recordRequestDuration(method: string, statusCode: number, durationSeconds: number) {
  requestDuration.labels(method, statusCode.toString()).observe(durationSeconds);
}

/**
 * Méthode helper: Enregistrer une taille de payload
 */
export function recordPayloadSize(method: string, sizeBytes: number) {
  payloadSize.labels(method).observe(sizeBytes);
}

/**
 * Méthode helper: Enregistrer un snippet généré
 */
export function recordSnippetGenerated(language: 'node' | 'php' | 'python' | 'curl') {
  snippetsGenerated.labels(language).inc();
}

/**
 * Méthode helper: Enregistrer une suggestion Sira
 */
export function recordSiraSuggestion(suggestionType: string, severity: 'info' | 'warning' | 'error') {
  siraSuggestions.labels(suggestionType, severity).inc();
}

/**
 * Méthode helper: Mettre à jour le nombre d'utilisateurs actifs
 */
export function updateActiveUsers(count: number) {
  activeUsers.set(count);
}

/**
 * Méthode helper: Mettre à jour les connexions DB
 */
export function updateDBConnections(idle: number, active: number) {
  dbConnections.labels('idle').set(idle);
  dbConnections.labels('active').set(active);
}

/**
 * Méthode helper: Mettre à jour l'utilisation mémoire
 */
export function updateMemoryUsage() {
  const usage = process.memoryUsage();
  memoryUsage.labels('heapUsed').set(usage.heapUsed);
  memoryUsage.labels('heapTotal').set(usage.heapTotal);
  memoryUsage.labels('rss').set(usage.rss);
}

// Mettre à jour la mémoire toutes les 30 secondes
setInterval(() => {
  updateMemoryUsage();
}, 30000);

/**
 * Handler pour l'endpoint /metrics
 */
export const metricsHandler = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
};

/**
 * Reset all metrics (pour les tests)
 */
export function resetMetrics() {
  register.resetMetrics();
}
