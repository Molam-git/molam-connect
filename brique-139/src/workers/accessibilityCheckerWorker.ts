/**
 * BRIQUE 139 — Accessibility Checker Worker
 * Scan UI builds and log WCAG compliance issues
 */

import { query } from '../db';
import type { AccessibilityIssue } from '../types';

/**
 * Accessibility checker worker
 * Scans for common WCAG 2.2 compliance issues
 */
export async function accessibilityCheckerWorker(): Promise<void> {
  const startTime = Date.now();
  console.log('[AccessibilityChecker] Starting accessibility audit...');

  try {
    const issues: AccessibilityIssue[] = [];

    // 1. Check for missing translations (accessibility issue)
    console.log('[AccessibilityChecker] Checking for missing translations...');
    const missingTranslations = await checkMissingTranslations();
    issues.push(...missingTranslations);

    // 2. Check for untranslated error messages
    console.log('[AccessibilityChecker] Checking error message translations...');
    const errorMessages = await checkErrorMessageTranslations();
    issues.push(...errorMessages);

    // 3. Check RTL language support
    console.log('[AccessibilityChecker] Checking RTL language support...');
    const rtlIssues = await checkRTLSupport();
    issues.push(...rtlIssues);

    // 4. Check for accessibility logs with unresolved critical issues
    console.log('[AccessibilityChecker] Checking unresolved critical issues...');
    const unresolvedIssues = await checkUnresolvedIssues();
    issues.push(...unresolvedIssues);

    // 5. Check translation coverage
    console.log('[AccessibilityChecker] Checking translation coverage...');
    const coverageIssues = await checkTranslationCoverage();
    issues.push(...coverageIssues);

    // Log results
    const summary = {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      notices: issues.filter((i) => i.severity === 'info').length,
    };

    const duration = Date.now() - startTime;
    console.log(
      `[AccessibilityChecker] Completed: ${issues.length} issues found in ${duration}ms`
    );
    console.log(`[AccessibilityChecker] Summary:`, summary);

    // Save issues to database
    for (const issue of issues) {
      await query(
        `INSERT INTO accessibility_logs (log_type, actor, action, module, severity, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'accessibility_check',
          'system:accessibility-checker-worker',
          'audit',
          issue.element || 'general',
          issue.severity,
          JSON.stringify({
            type: issue.type,
            message: issue.message,
            wcag_criterion: issue.wcag_criterion,
            suggestion: issue.suggestion,
          }),
        ]
      );
    }

    // Send alert if critical issues found
    if (summary.errors > 0) {
      console.warn(`[AccessibilityChecker] ⚠️  ${summary.errors} critical issues found!`);
      await sendAccessibilityAlert(issues, summary);
    }
  } catch (error) {
    console.error('[AccessibilityChecker] Error:', error);
    throw error;
  }
}

/**
 * Check for missing translations across languages
 */
async function checkMissingTranslations(): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  const result = await query<{ lang: string; module: string; missing_count: number }>(`
    WITH all_keys AS (
      SELECT DISTINCT key, module
      FROM translations
    ),
    lang_coverage AS (
      SELECT
        l.code as lang,
        ak.module,
        COUNT(ak.key) as total_keys,
        COUNT(t.key) as translated_keys
      FROM languages l
      CROSS JOIN all_keys ak
      LEFT JOIN translations t ON t.lang_code = l.code AND t.key = ak.key AND t.module = ak.module
      WHERE l.is_active = true
      GROUP BY l.code, ak.module
    )
    SELECT
      lang,
      module,
      (total_keys - translated_keys) as missing_count
    FROM lang_coverage
    WHERE total_keys - translated_keys > 0
    ORDER BY missing_count DESC
  `);

  for (const row of result.rows) {
    issues.push({
      type: 'missing_translations',
      severity: row.missing_count > 10 ? 'error' : 'warning',
      message: `Missing ${row.missing_count} translations in ${row.lang}/${row.module}`,
      element: `${row.lang}:${row.module}`,
      wcag_criterion: '3.1.1 Language of Page',
      suggestion: `Add missing translations for ${row.lang} in ${row.module} module`,
    });
  }

  return issues;
}

/**
 * Check for error message translations
 */
async function checkErrorMessageTranslations(): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  // Check if error messages are translated in all active languages
  const result = await query<{ lang: string; error_count: number }>(`
    SELECT
      l.code as lang,
      COUNT(t.key) as error_count
    FROM languages l
    LEFT JOIN translations t ON t.lang_code = l.code AND t.key LIKE 'error.%'
    WHERE l.is_active = true
    GROUP BY l.code
    HAVING COUNT(t.key) < 10
  `);

  for (const row of result.rows) {
    issues.push({
      type: 'error_messages',
      severity: 'warning',
      message: `Only ${row.error_count} error messages translated in ${row.lang}`,
      element: row.lang,
      wcag_criterion: '3.3.1 Error Identification',
      suggestion: `Add comprehensive error message translations for ${row.lang}`,
    });
  }

  return issues;
}

/**
 * Check RTL language support
 */
async function checkRTLSupport(): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  // Check if RTL languages (Arabic) have adequate translations
  const result = await query<{ lang: string; coverage: number }>(`
    WITH rtl_languages AS (
      SELECT code FROM languages WHERE direction = 'rtl' AND is_active = true
    ),
    all_keys AS (
      SELECT COUNT(DISTINCT key) as total FROM translations
    ),
    rtl_translations AS (
      SELECT
        t.lang_code as lang,
        COUNT(DISTINCT t.key) as translated
      FROM translations t
      WHERE t.lang_code IN (SELECT code FROM rtl_languages)
      GROUP BY t.lang_code
    )
    SELECT
      rt.lang,
      ROUND((rt.translated::decimal / ak.total) * 100, 2) as coverage
    FROM rtl_translations rt
    CROSS JOIN all_keys ak
  `);

  for (const row of result.rows) {
    if (row.coverage < 50) {
      issues.push({
        type: 'rtl_support',
        severity: 'error',
        message: `RTL language ${row.lang} has only ${row.coverage}% translation coverage`,
        element: row.lang,
        wcag_criterion: '1.3.2 Meaningful Sequence',
        suggestion: `Increase translation coverage for RTL language ${row.lang}`,
      });
    } else if (row.coverage < 80) {
      issues.push({
        type: 'rtl_support',
        severity: 'warning',
        message: `RTL language ${row.lang} has ${row.coverage}% translation coverage`,
        element: row.lang,
        wcag_criterion: '1.3.2 Meaningful Sequence',
        suggestion: `Improve translation coverage for RTL language ${row.lang}`,
      });
    }
  }

  return issues;
}

/**
 * Check for unresolved critical accessibility issues
 */
async function checkUnresolvedIssues(): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  const result = await query<{ severity: string; count: number }>(`
    SELECT severity, COUNT(*) as count
    FROM accessibility_logs
    WHERE resolved = false AND severity IN ('error', 'critical')
    GROUP BY severity
  `);

  for (const row of result.rows) {
    issues.push({
      type: 'unresolved_issues',
      severity: row.severity as any,
      message: `${row.count} unresolved ${row.severity} accessibility issues`,
      wcag_criterion: 'General',
      suggestion: `Review and resolve ${row.count} ${row.severity} level issues`,
    });
  }

  return issues;
}

/**
 * Check translation coverage per module
 */
async function checkTranslationCoverage(): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  const { getTranslationCoverage } = await import('../services/i18nService');
  const coverage = await getTranslationCoverage();

  for (const item of coverage) {
    if (item.coverage_percent < 50) {
      issues.push({
        type: 'low_coverage',
        severity: 'error',
        message: `Very low translation coverage: ${item.lang}/${item.module} at ${item.coverage_percent}%`,
        element: `${item.lang}:${item.module}`,
        wcag_criterion: '3.1.1 Language of Page',
        suggestion: `Urgent: Add translations for ${item.lang}/${item.module}`,
      });
    } else if (item.coverage_percent < 80) {
      issues.push({
        type: 'low_coverage',
        severity: 'warning',
        message: `Low translation coverage: ${item.lang}/${item.module} at ${item.coverage_percent}%`,
        element: `${item.lang}:${item.module}`,
        wcag_criterion: '3.1.1 Language of Page',
        suggestion: `Improve translations for ${item.lang}/${item.module}`,
      });
    }
  }

  return issues;
}

/**
 * Send alert for critical accessibility issues
 */
async function sendAccessibilityAlert(
  issues: AccessibilityIssue[],
  summary: { errors: number; warnings: number; notices: number }
): Promise<void> {
  // TODO: Implement alert sending (email, Slack, Teams, etc.)
  console.log('[AccessibilityChecker] Would send alert:', { summary, issues });

  // Example: Send to Slack
  /*
  if (process.env.SLACK_WEBHOOK_URL) {
    const axios = require('axios');
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: `🚨 Accessibility Alert: ${summary.errors} critical issues found`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Accessibility Audit Results*\n• Errors: ${summary.errors}\n• Warnings: ${summary.warnings}\n• Notices: ${summary.notices}`,
          },
        },
      ],
    });
  }
  */
}
