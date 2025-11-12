/**
 * Brique 41 - Molam Connect
 * Verification service - syncs with Wallet (B33)
 */

import { pool } from "../db";

export interface VerificationStatus {
  status: "unverified" | "pending" | "verified" | "failed";
  wallet_status?: string;
  last_checked?: Date;
}

/**
 * Refresh verification status from Wallet (B33)
 * Pulls the latest verification status from wallet_verifications table
 */
export async function refreshVerification(connectAccountId: string): Promise<VerificationStatus> {
  try {
    // Query to get latest wallet verification status
    const query = `
      SELECT
        ca.id,
        ca.wallet_id,
        ca.verification_status as current_status,
        wv.status AS wallet_verif_status,
        wv.updated_at as wallet_updated_at
      FROM connect_accounts ca
      LEFT JOIN wallet_verifications wv ON wv.wallet_id = ca.wallet_id
      WHERE ca.id = $1
      ORDER BY wv.updated_at DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [connectAccountId]);

    if (!rows.length) {
      console.warn(`[Verification] Account not found: ${connectAccountId}`);
      return { status: "unverified" };
    }

    const row = rows[0];
    const walletStatus = row.wallet_verif_status;

    // Map wallet verification status to Connect verification status
    let verificationStatus: "unverified" | "pending" | "verified" | "failed";

    if (walletStatus === "verified" || walletStatus === "approved") {
      verificationStatus = "verified";
    } else if (walletStatus === "failed" || walletStatus === "rejected") {
      verificationStatus = "failed";
    } else if (walletStatus === "pending" || walletStatus === "in_review") {
      verificationStatus = "pending";
    } else {
      verificationStatus = "unverified";
    }

    // Update Connect account if status changed
    if (row.current_status !== verificationStatus) {
      await pool.query(
        `UPDATE connect_accounts
         SET verification_status = $1, updated_at = now()
         WHERE id = $2`,
        [verificationStatus, connectAccountId]
      );

      console.log(
        `[Verification] Updated account ${connectAccountId}: ${row.current_status} -> ${verificationStatus}`
      );
    }

    return {
      status: verificationStatus,
      wallet_status: walletStatus,
      last_checked: new Date(),
    };
  } catch (e: any) {
    console.error(`[Verification] Error refreshing status for ${connectAccountId}:`, e.message);
    throw e;
  }
}

/**
 * Check if account is verified
 */
export async function isAccountVerified(connectAccountId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT verification_status FROM connect_accounts WHERE id = $1`,
    [connectAccountId]
  );

  if (!rows.length) {
    return false;
  }

  return rows[0].verification_status === "verified";
}

/**
 * Get verification requirements for account
 * Based on business type and country
 */
export async function getVerificationRequirements(connectAccountId: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT business_type, country FROM connect_accounts WHERE id = $1`,
    [connectAccountId]
  );

  if (!rows.length) {
    return [];
  }

  const { business_type, country } = rows[0];
  const requirements: string[] = [];

  // Base requirements
  requirements.push("identity_document");

  // Business-specific requirements
  if (business_type === "company" || business_type === "platform") {
    requirements.push("business_registration");
    requirements.push("tax_id");
    requirements.push("bank_account_verification");
  }

  // Country-specific requirements (BCEAO example)
  if (["SN", "CI", "BJ", "TG", "ML", "BF", "NE", "GN"].includes(country)) {
    requirements.push("bceao_compliance");
  }

  return requirements;
}

/**
 * Bulk refresh verification for multiple accounts
 */
export async function bulkRefreshVerification(
  connectAccountIds: string[]
): Promise<Map<string, VerificationStatus>> {
  const results = new Map<string, VerificationStatus>();

  for (const accountId of connectAccountIds) {
    try {
      const status = await refreshVerification(accountId);
      results.set(accountId, status);
    } catch (e: any) {
      console.error(`[Verification] Failed to refresh ${accountId}:`, e.message);
      results.set(accountId, { status: "unverified" });
    }
  }

  return results;
}
