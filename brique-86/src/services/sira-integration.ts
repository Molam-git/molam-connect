// SIRA integration for suspicious reconciliation patterns
// Detects fraud, money laundering, and anomalous settlement patterns

import { pool } from '../utils/db';

interface SuspiciousPattern {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, any>;
  entities: string[];
}

const SIRA_API_ENDPOINT = process.env.SIRA_API_ENDPOINT || 'http://localhost:3059/api';
const SIRA_API_KEY = process.env.SIRA_API_KEY || '';

/**
 * Analyze statement line for suspicious patterns
 */
export async function analyzeSuspiciousLine(lineId: string): Promise<void> {
  const { rows: [line] } = await pool.query(
    `SELECT * FROM bank_statement_lines WHERE id = $1`,
    [lineId]
  );

  if (!line) {
    return;
  }

  const patterns: SuspiciousPattern[] = [];

  // 1. High-value transaction with no match
  if (Math.abs(line.amount) > 50000 && line.reconciliation_status === 'unmatched') {
    patterns.push({
      type: 'high_value_unmatched',
      severity: 'high',
      description: `High-value transaction (${line.currency} ${Math.abs(line.amount)}) has no match`,
      evidence: {
        line_id: lineId,
        amount: line.amount,
        currency: line.currency,
        description: line.description,
      },
      entities: [lineId],
    });
  }

  // 2. Round amount suspicious pattern (money laundering indicator)
  if (isRoundAmount(line.amount) && Math.abs(line.amount) > 10000) {
    patterns.push({
      type: 'round_amount_pattern',
      severity: 'medium',
      description: `Large round amount transaction: ${line.currency} ${Math.abs(line.amount)}`,
      evidence: {
        line_id: lineId,
        amount: line.amount,
      },
      entities: [lineId],
    });
  }

  // 3. Frequent small transactions from same beneficiary (structuring)
  if (line.beneficiary_account) {
    const structuringPattern = await checkStructuringPattern(line.beneficiary_account, line.currency);
    if (structuringPattern) {
      patterns.push(structuringPattern);
    }
  }

  // 4. Partial settlement (fee withholding) without explanation
  const partialMatch = await checkPartialSettlement(lineId);
  if (partialMatch) {
    patterns.push(partialMatch);
  }

  // 5. Unusual beneficiary name patterns
  if (line.beneficiary_name) {
    const namePattern = checkSuspiciousName(line.beneficiary_name);
    if (namePattern) {
      patterns.push({
        ...namePattern,
        evidence: { ...namePattern.evidence, line_id: lineId },
      });
    }
  }

  // 6. Reversal patterns (potential fraud)
  const reversalPattern = await checkReversalPattern(line);
  if (reversalPattern) {
    patterns.push(reversalPattern);
  }

  // Send patterns to SIRA
  for (const pattern of patterns) {
    await reportToSIRA(pattern);
  }

  // If critical patterns found, flag line
  if (patterns.some(p => p.severity === 'critical' || p.severity === 'high')) {
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'suspicious', updated_at = now()
       WHERE id = $1`,
      [lineId]
    );
  }
}

/**
 * Check for structuring pattern (multiple small transactions to avoid reporting threshold)
 */
async function checkStructuringPattern(beneficiaryAccount: string, currency: string): Promise<SuspiciousPattern | null> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count, SUM(ABS(amount)) as total
     FROM bank_statement_lines
     WHERE beneficiary_account = $1
     AND currency = $2
     AND value_date >= NOW() - INTERVAL '7 days'
     AND ABS(amount) < 10000`,
    [beneficiaryAccount, currency]
  );

  const { count, total } = rows[0];

  if (count >= 5 && total > 40000) {
    return {
      type: 'structuring_pattern',
      severity: 'high',
      description: `Potential structuring: ${count} transactions totaling ${currency} ${total} in 7 days`,
      evidence: {
        beneficiary_account: beneficiaryAccount,
        transaction_count: count,
        total_amount: total,
        currency,
      },
      entities: [beneficiaryAccount],
    };
  }

  return null;
}

/**
 * Check for partial settlement patterns
 */
async function checkPartialSettlement(lineId: string): Promise<SuspiciousPattern | null> {
  const { rows: [line] } = await pool.query(
    `SELECT l.*, q.candidate_entities
     FROM bank_statement_lines l
     LEFT JOIN reconciliation_queue q ON q.bank_statement_line_id = l.id
     WHERE l.id = $1`,
    [lineId]
  );

  if (!line || !line.candidate_entities) {
    return null;
  }

  // Check if any candidate has significantly different amount (>2% difference)
  const candidates = JSON.parse(line.candidate_entities);
  for (const candidate of candidates) {
    if (candidate.amount) {
      const diff = Math.abs(Math.abs(line.amount) - Math.abs(candidate.amount));
      const diffPct = diff / Math.abs(candidate.amount);

      if (diffPct > 0.02 && diffPct < 0.15) {
        // 2-15% difference suggests fee withholding
        return {
          type: 'partial_settlement',
          severity: 'medium',
          description: `Partial settlement detected: expected ${candidate.amount}, received ${line.amount}`,
          evidence: {
            line_id: lineId,
            expected_amount: candidate.amount,
            received_amount: line.amount,
            difference: diff,
            difference_pct: diffPct * 100,
          },
          entities: [lineId],
        };
      }
    }
  }

  return null;
}

/**
 * Check for suspicious beneficiary names
 */
function checkSuspiciousName(name: string): SuspiciousPattern | null {
  const nameLower = name.toLowerCase();

  // List of suspicious keywords
  const suspiciousKeywords = [
    'casino',
    'crypto',
    'bitcoin',
    'binance',
    'coinbase',
    'gambling',
    'mixer',
    'darknet',
  ];

  for (const keyword of suspiciousKeywords) {
    if (nameLower.includes(keyword)) {
      return {
        type: 'suspicious_beneficiary',
        severity: 'high',
        description: `Suspicious beneficiary name: ${name}`,
        evidence: {
          beneficiary_name: name,
          matched_keyword: keyword,
        },
        entities: [],
      };
    }
  }

  // Check for random/generated names (many numbers, special chars)
  const numberCount = (name.match(/\d/g) || []).length;
  if (numberCount > name.length * 0.3) {
    return {
      type: 'suspicious_beneficiary',
      severity: 'medium',
      description: `Unusual beneficiary name pattern: ${name}`,
      evidence: {
        beneficiary_name: name,
        reason: 'high_number_ratio',
      },
      entities: [],
    };
  }

  return null;
}

/**
 * Check for reversal patterns (fraud indicator)
 */
async function checkReversalPattern(line: any): Promise<SuspiciousPattern | null> {
  if (line.transaction_type !== 'reversal') {
    return null;
  }

  // Check for multiple reversals from same account
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count
     FROM bank_statement_lines
     WHERE beneficiary_account = $1
     AND transaction_type = 'reversal'
     AND value_date >= NOW() - INTERVAL '30 days'`,
    [line.beneficiary_account]
  );

  if (rows[0].count >= 3) {
    return {
      type: 'multiple_reversals',
      severity: 'high',
      description: `Multiple reversals from same account: ${rows[0].count} in 30 days`,
      evidence: {
        beneficiary_account: line.beneficiary_account,
        reversal_count: rows[0].count,
      },
      entities: [line.beneficiary_account],
    };
  }

  return null;
}

/**
 * Report pattern to SIRA
 */
async function reportToSIRA(pattern: SuspiciousPattern): Promise<void> {
  try {
    const response = await fetch(`${SIRA_API_ENDPOINT}/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SIRA_API_KEY}`,
      },
      body: JSON.stringify({
        source: 'brique-86-reconciliation',
        type: pattern.type,
        severity: pattern.severity,
        description: pattern.description,
        evidence: pattern.evidence,
        entities: pattern.entities,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error('Failed to report to SIRA:', await response.text());
    } else {
      console.log(`Reported ${pattern.type} to SIRA (severity: ${pattern.severity})`);
    }

    // Log locally
    await pool.query(
      `INSERT INTO reconciliation_logs (actor, actor_type, action, details, created_at)
       VALUES ('sira', 'system', 'suspicious_pattern_detected', $1, now())`,
      [JSON.stringify(pattern)]
    );
  } catch (error: any) {
    console.error('Error reporting to SIRA:', error);
  }
}

/**
 * Helper: check if amount is suspiciously round
 */
function isRoundAmount(amount: number): boolean {
  const absAmount = Math.abs(amount);

  // Check for exact thousands
  if (absAmount % 1000 === 0) {
    return true;
  }

  // Check for exact hundreds
  if (absAmount % 100 === 0 && absAmount >= 1000) {
    return true;
  }

  return false;
}

/**
 * Batch analyze all unmatched high-value lines
 */
export async function batchAnalyzeSuspiciousLines(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id FROM bank_statement_lines
     WHERE reconciliation_status IN ('unmatched', 'manual_review')
     AND ABS(amount) > 10000
     AND created_at >= NOW() - INTERVAL '7 days'
     LIMIT 100`
  );

  console.log(`Analyzing ${rows.length} suspicious lines...`);

  for (const row of rows) {
    try {
      await analyzeSuspiciousLine(row.id);
    } catch (error: any) {
      console.error(`Failed to analyze line ${row.id}:`, error);
    }
  }
}
