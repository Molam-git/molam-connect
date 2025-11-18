// Reconciliation Matching Engine
// Implements multi-level matching: exact reference → amount+date tolerance → fuzzy matching

import { pool } from '../utils/db';

interface StatementLine {
  id: string;
  bank_profile_id: string;
  value_date: Date;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  reference?: string;
  description?: string;
  beneficiary_json?: any;
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  beneficiary_iban?: string;
  beneficiary_name?: string;
  external_id?: string;
  created_at: Date;
}

interface MatchResult {
  matched: boolean;
  payout_id?: string;
  match_method?: string;
  match_confidence?: number;
  match_details?: any;
}

const DATE_TOLERANCE_DAYS = 3; // Allow ±3 days for date matching
const AMOUNT_TOLERANCE_PERCENT = 0.01; // 1% tolerance for amount matching
const FUZZY_MATCH_THRESHOLD = 0.75; // 75% similarity threshold for fuzzy matching

/**
 * Multi-level reconciliation matching engine
 */
export class MatchingEngine {
  /**
   * Attempt to match a statement line with a payout
   */
  async matchStatementLine(line: StatementLine): Promise<MatchResult> {
    console.log(`[MatchingEngine] Matching line ${line.id}`);

    // Level 1: Exact reference match
    const exactMatch = await this.matchByExactReference(line);
    if (exactMatch.matched) {
      console.log(`[MatchingEngine] ✓ Exact reference match found`);
      return exactMatch;
    }

    // Level 2: Amount + date tolerance match
    const amountDateMatch = await this.matchByAmountAndDate(line);
    if (amountDateMatch.matched) {
      console.log(`[MatchingEngine] ✓ Amount+Date match found`);
      return amountDateMatch;
    }

    // Level 3: Fuzzy matching (name + amount)
    const fuzzyMatch = await this.matchByFuzzyLogic(line);
    if (fuzzyMatch.matched) {
      console.log(`[MatchingEngine] ✓ Fuzzy match found`);
      return fuzzyMatch;
    }

    console.log(`[MatchingEngine] ✗ No match found`);
    return { matched: false };
  }

  /**
   * Level 1: Exact reference match
   * Match by external_id or reference code
   */
  private async matchByExactReference(line: StatementLine): Promise<MatchResult> {
    if (!line.reference) {
      return { matched: false };
    }

    // Try to find payout by external_id or provider_ref
    const { rows } = await pool.query<Payout>(
      `SELECT id, amount, currency, beneficiary_iban, beneficiary_name, external_id, created_at
       FROM payouts
       WHERE (external_id = $1 OR provider_ref = $1)
         AND currency = $2
         AND status IN ('sent', 'completed')
         AND reconciled_at IS NULL
       LIMIT 1`,
      [line.reference, line.currency]
    );

    if (rows.length === 0) {
      return { matched: false };
    }

    const payout = rows[0];

    // Validate amount matches (with small tolerance)
    const amountMatch = this.isAmountMatch(line.amount, payout.amount, 0.01);
    if (!amountMatch) {
      return { matched: false };
    }

    return {
      matched: true,
      payout_id: payout.id,
      match_method: 'exact_reference',
      match_confidence: 1.0,
      match_details: {
        reference: line.reference,
        amount_diff: Math.abs(line.amount - payout.amount)
      }
    };
  }

  /**
   * Level 2: Amount + date tolerance match
   * Match by amount within tolerance and date within range
   */
  private async matchByAmountAndDate(line: StatementLine): Promise<MatchResult> {
    // Calculate date range
    const dateFrom = new Date(line.value_date);
    dateFrom.setDate(dateFrom.getDate() - DATE_TOLERANCE_DAYS);

    const dateTo = new Date(line.value_date);
    dateTo.setDate(dateTo.getDate() + DATE_TOLERANCE_DAYS);

    // Calculate amount range (±1% tolerance)
    const amountMin = line.amount * (1 - AMOUNT_TOLERANCE_PERCENT);
    const amountMax = line.amount * (1 + AMOUNT_TOLERANCE_PERCENT);

    // Find payouts within amount and date range
    const { rows } = await pool.query<Payout>(
      `SELECT id, amount, currency, beneficiary_iban, beneficiary_name, external_id, created_at
       FROM payouts
       WHERE currency = $1
         AND amount BETWEEN $2 AND $3
         AND created_at BETWEEN $4 AND $5
         AND status IN ('sent', 'completed')
         AND reconciled_at IS NULL
       ORDER BY ABS(amount - $6) ASC, ABS(EXTRACT(EPOCH FROM (created_at - $7))) ASC
       LIMIT 5`,
      [line.currency, amountMin, amountMax, dateFrom, dateTo, line.amount, line.value_date]
    );

    if (rows.length === 0) {
      return { matched: false };
    }

    // If multiple candidates, check for additional matching criteria
    let bestMatch: Payout | null = null;
    let bestScore = 0;

    for (const payout of rows) {
      let score = 0;

      // Score based on amount accuracy
      const amountDiff = Math.abs(line.amount - payout.amount);
      const amountScore = 1 - (amountDiff / line.amount);
      score += amountScore * 0.5;

      // Score based on date proximity
      const dateDiff = Math.abs(line.value_date.getTime() - payout.created_at.getTime());
      const dateDiffDays = dateDiff / (1000 * 60 * 60 * 24);
      const dateScore = Math.max(0, 1 - (dateDiffDays / DATE_TOLERANCE_DAYS));
      score += dateScore * 0.3;

      // Score based on beneficiary match (if available)
      if (line.beneficiary_json && payout.beneficiary_iban) {
        const beneficiary = line.beneficiary_json;
        if (beneficiary.iban === payout.beneficiary_iban) {
          score += 0.2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = payout;
      }
    }

    // Require minimum confidence of 0.7 for amount+date match
    if (bestMatch && bestScore >= 0.7) {
      return {
        matched: true,
        payout_id: bestMatch.id,
        match_method: 'amount_date',
        match_confidence: bestScore,
        match_details: {
          amount_diff: Math.abs(line.amount - bestMatch.amount),
          date_diff_days: Math.abs(line.value_date.getTime() - bestMatch.created_at.getTime()) / (1000 * 60 * 60 * 24),
          candidates_checked: rows.length
        }
      };
    }

    return { matched: false };
  }

  /**
   * Level 3: Fuzzy matching
   * Match by beneficiary name similarity + amount
   */
  private async matchByFuzzyLogic(line: StatementLine): Promise<MatchResult> {
    // Extract beneficiary name from line
    const lineBeneficiaryName = line.beneficiary_json?.name || line.description;
    if (!lineBeneficiaryName) {
      return { matched: false };
    }

    // Calculate amount range (±5% tolerance for fuzzy match)
    const amountMin = line.amount * 0.95;
    const amountMax = line.amount * 1.05;

    // Calculate date range (±7 days for fuzzy match)
    const dateFrom = new Date(line.value_date);
    dateFrom.setDate(dateFrom.getDate() - 7);

    const dateTo = new Date(line.value_date);
    dateTo.setDate(dateTo.getDate() + 7);

    // Find candidate payouts
    const { rows } = await pool.query<Payout>(
      `SELECT id, amount, currency, beneficiary_iban, beneficiary_name, external_id, created_at
       FROM payouts
       WHERE currency = $1
         AND amount BETWEEN $2 AND $3
         AND created_at BETWEEN $4 AND $5
         AND status IN ('sent', 'completed')
         AND reconciled_at IS NULL
         AND beneficiary_name IS NOT NULL
       LIMIT 20`,
      [line.currency, amountMin, amountMax, dateFrom, dateTo]
    );

    if (rows.length === 0) {
      return { matched: false };
    }

    // Calculate fuzzy match scores
    let bestMatch: Payout | null = null;
    let bestScore = 0;

    for (const payout of rows) {
      if (!payout.beneficiary_name) continue;

      // Calculate string similarity
      const nameSimilarity = this.calculateStringSimilarity(
        this.normalizeName(lineBeneficiaryName),
        this.normalizeName(payout.beneficiary_name)
      );

      if (nameSimilarity < FUZZY_MATCH_THRESHOLD) {
        continue;
      }

      // Calculate composite score
      let score = nameSimilarity * 0.6; // Name similarity weighted 60%

      // Amount accuracy
      const amountDiff = Math.abs(line.amount - payout.amount);
      const amountScore = 1 - (amountDiff / line.amount);
      score += amountScore * 0.3;

      // Date proximity
      const dateDiff = Math.abs(line.value_date.getTime() - payout.created_at.getTime());
      const dateDiffDays = dateDiff / (1000 * 60 * 60 * 24);
      const dateScore = Math.max(0, 1 - (dateDiffDays / 7));
      score += dateScore * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = payout;
      }
    }

    // Require minimum confidence of 0.75 for fuzzy match
    if (bestMatch && bestScore >= FUZZY_MATCH_THRESHOLD) {
      return {
        matched: true,
        payout_id: bestMatch.id,
        match_method: 'fuzzy',
        match_confidence: bestScore,
        match_details: {
          name_similarity: this.calculateStringSimilarity(
            this.normalizeName(lineBeneficiaryName),
            this.normalizeName(bestMatch.beneficiary_name!)
          ),
          amount_diff: Math.abs(line.amount - bestMatch.amount),
          line_name: lineBeneficiaryName,
          payout_name: bestMatch.beneficiary_name
        }
      };
    }

    return { matched: false };
  }

  /**
   * Check if amounts match within tolerance
   */
  private isAmountMatch(amount1: number, amount2: number, tolerance: number): boolean {
    const diff = Math.abs(amount1 - amount2);
    const maxDiff = Math.max(amount1, amount2) * tolerance;
    return diff <= maxDiff;
  }

  /**
   * Normalize name for comparison
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize spaces
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Create distance matrix
    const matrix: number[][] = [];

    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    // Calculate distances
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        const cost = str1[j - 1] === str2[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len2][len1];
    const maxLength = Math.max(len1, len2);

    // Convert distance to similarity (0 to 1)
    return 1 - (distance / maxLength);
  }
}

export default MatchingEngine;
