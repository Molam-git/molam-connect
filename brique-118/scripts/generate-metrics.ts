#!/usr/bin/env ts-node

/**
 * Brique 118ter: Metrics Generator Script
 * Génère des métriques de test pour démonstration
 */

import {
  recordTestRun,
  recordFuzzingAlert,
  recordRateLimitHit,
  recordRBACViolation,
  recordSharedSession,
  recordRequestDuration,
  recordPayloadSize,
  recordSnippetGenerated,
  recordSiraSuggestion
} from '../src/metrics';

console.log('🎯 Generating test metrics...\n');

// Simulate test runs
console.log('📊 Simulating test runs...');
for (let i = 0; i < 100; i++) {
  const status = Math.random() > 0.1 ? 'success' : 'failure';
  const methods = ['GET', 'POST', 'PUT', 'DELETE'];
  const endpoints = ['/v1/payments', '/v1/refunds', '/healthz', '/v1/webhooks'];

  const method = methods[Math.floor(Math.random() * methods.length)];
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

  recordTestRun(status, method, endpoint);

  // Record duration
  const duration = Math.random() * 2; // 0-2 seconds
  recordRequestDuration(method, status === 'success' ? 200 : 500, duration);

  // Record payload size
  if (method === 'POST' || method === 'PUT') {
    const size = Math.floor(Math.random() * 10000); // 0-10KB
    recordPayloadSize(method, size);
  }
}
console.log('✅ Generated 100 test run metrics\n');

// Simulate fuzzing alerts
console.log('🚨 Simulating fuzzing alerts...');
const attackTypes = [
  'sql_injection',
  'xss',
  'command_injection',
  'path_traversal',
  'ssrf',
  'prototype_pollution'
];
const severities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

for (let i = 0; i < 30; i++) {
  const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
  const severity = severities[Math.floor(Math.random() * severities.length)];

  recordFuzzingAlert(attackType, severity);
}
console.log('✅ Generated 30 fuzzing alert metrics\n');

// Simulate rate limit hits
console.log('🚫 Simulating rate limit hits...');
const roles = ['developer', 'ops', 'pay_admin', 'sira_admin'];
const limitEndpoints = [
  '/api/playground/run',
  '/api/playground/save',
  '/api/playground/share'
];

for (let i = 0; i < 20; i++) {
  const role = roles[Math.floor(Math.random() * roles.length)];
  const endpoint = limitEndpoints[Math.floor(Math.random() * limitEndpoints.length)];

  recordRateLimitHit(role, endpoint);
}
console.log('✅ Generated 20 rate limit hit metrics\n');

// Simulate RBAC violations
console.log('🔒 Simulating RBAC violations...');
const rbacActions = ['GET', 'POST', 'DELETE'];
const rbacResources = [
  '/api/playground/ops/logs',
  '/api/playground/sessions/purge',
  '/api/playground/ops/metrics'
];

for (let i = 0; i < 15; i++) {
  const role = roles[Math.floor(Math.random() * roles.length)];
  const action = rbacActions[Math.floor(Math.random() * rbacActions.length)];
  const resource = rbacResources[Math.floor(Math.random() * rbacResources.length)];

  recordRBACViolation(role, action, resource);
}
console.log('✅ Generated 15 RBAC violation metrics\n');

// Simulate shared sessions
console.log('🔗 Simulating shared sessions...');
const ttls = [
  3600,      // 1 hour - short
  86400,     // 1 day - medium
  604800,    // 1 week - medium
  2592000    // 30 days - long
];

for (let i = 0; i < 25; i++) {
  const ttl = ttls[Math.floor(Math.random() * ttls.length)];
  recordSharedSession(ttl);
}
console.log('✅ Generated 25 shared session metrics\n');

// Simulate snippet generation
console.log('📝 Simulating snippet generation...');
const languages: Array<'node' | 'php' | 'python' | 'curl'> = ['node', 'php', 'python', 'curl'];

for (let i = 0; i < 40; i++) {
  const language = languages[Math.floor(Math.random() * languages.length)];
  recordSnippetGenerated(language);
}
console.log('✅ Generated 40 snippet generation metrics\n');

// Simulate Sira suggestions
console.log('🤖 Simulating Sira suggestions...');
const suggestionTypes = [
  'missing_idempotency',
  'invalid_method',
  'missing_path',
  'optimization_hint',
  'security_warning'
];
const siraSeverities: Array<'info' | 'warning' | 'error'> = ['info', 'warning', 'error'];

for (let i = 0; i < 35; i++) {
  const suggestionType = suggestionTypes[Math.floor(Math.random() * suggestionTypes.length)];
  const severity = siraSeverities[Math.floor(Math.random() * siraSeverities.length)];

  recordSiraSuggestion(suggestionType, severity);
}
console.log('✅ Generated 35 Sira suggestion metrics\n');

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All metrics generated successfully!');
console.log('═══════════════════════════════════════════════════════');
console.log('\n📊 Summary:');
console.log('  - Test Runs: 100');
console.log('  - Fuzzing Alerts: 30');
console.log('  - Rate Limit Hits: 20');
console.log('  - RBAC Violations: 15');
console.log('  - Shared Sessions: 25');
console.log('  - Snippets Generated: 40');
console.log('  - Sira Suggestions: 35');
console.log('\n🌐 Access metrics at: http://localhost:3000/metrics');
console.log('');
