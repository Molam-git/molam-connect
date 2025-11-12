/**
 * Brique 50 - Fiscal Reporting
 * HSM Integration for Document Signing
 */

import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const USE_HSM = process.env.USE_HSM === "true";
const HSM_ENDPOINT = process.env.HSM_ENDPOINT || "http://hsm:8080";

/**
 * Sign artifact with HSM (Hardware Security Module)
 * In production: integrate with AWS CloudHSM, Azure Key Vault, or dedicated HSM
 */
export async function signWithHSM(artifactKey: string, data?: Buffer): Promise<string> {
  if (!USE_HSM) {
    // Development mode: use local signing
    console.log(`[HSM] Signing artifact (local mode): ${artifactKey}`);

    // Generate a mock signature using SHA256
    const hash = crypto.createHash("sha256");
    hash.update(data || Buffer.from(artifactKey));
    const signature = hash.digest("hex");

    return signature;
  }

  // Production: call HSM API
  const response = await fetch(`${HSM_ENDPOINT}/v1/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HSM-Token": process.env.HSM_TOKEN || "",
    },
    body: JSON.stringify({
      key_id: process.env.HSM_KEY_ID || "fiscal-signing-key",
      algorithm: "RSA_PSS_SHA256",
      data: data ? data.toString("base64") : artifactKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`HSM signing failed: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.signature;
}

/**
 * Verify HSM signature
 */
export async function verifyHSMSignature(
  artifactKey: string,
  signature: string,
  data?: Buffer
): Promise<boolean> {
  if (!USE_HSM) {
    // Development mode: verify local signature
    const hash = crypto.createHash("sha256");
    hash.update(data || Buffer.from(artifactKey));
    const expectedSignature = hash.digest("hex");

    return signature === expectedSignature;
  }

  // Production: call HSM verification API
  const response = await fetch(`${HSM_ENDPOINT}/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HSM-Token": process.env.HSM_TOKEN || "",
    },
    body: JSON.stringify({
      key_id: process.env.HSM_KEY_ID || "fiscal-signing-key",
      algorithm: "RSA_PSS_SHA256",
      data: data ? data.toString("base64") : artifactKey,
      signature,
    }),
  });

  if (!response.ok) {
    throw new Error(`HSM verification failed: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.valid === true;
}
