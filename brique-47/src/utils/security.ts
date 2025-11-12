/**
 * Brique 47 - Disputes & Chargebacks
 * mTLS and Signature Verification for Network Ingestion
 */

import crypto from "crypto";

const NETWORK_IP_WHITELIST = (process.env.NETWORK_IP_WHITELIST || "").split(",");

const ACQUIRER_PUBLIC_KEYS: Record<string, string> = {
  visa: process.env.ACQUIRER_VISA_PUBLIC_KEY || "",
  mastercard: process.env.ACQUIRER_MASTERCARD_PUBLIC_KEY || "",
};

/**
 * Verify IP whitelist
 */
export function verifyIP(clientIP: string): boolean {
  if (!NETWORK_IP_WHITELIST.length) {
    console.warn("No IP whitelist configured");
    return true; // Allow all in development
  }

  // Simple IP check (production should use CIDR matching)
  return NETWORK_IP_WHITELIST.some(range => clientIP.startsWith(range.split("/")[0]));
}

/**
 * Verify HMAC SHA256 signature
 */
export function verifySignature(payload: string, signature: string, acquirer: string): boolean {
  const publicKey = ACQUIRER_PUBLIC_KEYS[acquirer];

  if (!publicKey) {
    throw new Error(`No public key configured for acquirer: ${acquirer}`);
  }

  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(payload);
    verify.end();

    const isValid = verify.verify(publicKey.replace(/\\n/g, "\n"), signature, "base64");
    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Extract client certificate from headers (nginx proxy)
 */
export function getClientCert(headers: any): string | null {
  // When using nginx with mTLS, client cert is passed in header
  const cert = headers["x-client-cert"] || headers["ssl-client-cert"];
  return cert || null;
}
