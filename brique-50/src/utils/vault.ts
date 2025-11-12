/**
 * Brique 50 - Fiscal Reporting
 * Vault Integration (HashiCorp Vault or AWS Secrets Manager)
 */

import dotenv from "dotenv";

dotenv.config();

const USE_LOCAL_SECRETS = process.env.USE_LOCAL_SECRETS === "true";

interface VaultCredential {
  user?: string;
  pass?: string;
  password?: string;
  api_token?: string;
  api_key?: string;
  port?: number;
  [key: string]: any;
}

/**
 * Get secret from Vault by reference path
 * In production: integrate with HashiCorp Vault or AWS Secrets Manager
 */
export async function getVaultSecret(vaultRef: any): Promise<VaultCredential> {
  if (USE_LOCAL_SECRETS) {
    // Development mode: use environment variables
    const path = typeof vaultRef === "string" ? vaultRef : vaultRef.path;
    console.log(`[Vault] Fetching local secret: ${path}`);

    // Mock credentials for development
    return {
      user: process.env[`VAULT_${path.replace(/\//g, "_").toUpperCase()}_USER`] || "test_user",
      pass: process.env[`VAULT_${path.replace(/\//g, "_").toUpperCase()}_PASS`] || "test_pass",
      api_token: process.env[`VAULT_${path.replace(/\//g, "_").toUpperCase()}_TOKEN`] || "test_token",
      port: 22,
    };
  }

  // Production: call Vault API
  const VAULT_ADDR = process.env.VAULT_ADDR || "http://vault:8200";
  const VAULT_TOKEN = process.env.VAULT_TOKEN || "";
  const path = typeof vaultRef === "string" ? vaultRef : vaultRef.path;

  const response = await fetch(`${VAULT_ADDR}/v1/secret/data/${path}`, {
    headers: {
      "X-Vault-Token": VAULT_TOKEN,
    },
  });

  if (!response.ok) {
    throw new Error(`Vault secret fetch failed: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data.data.data;
}

/**
 * Store secret in Vault
 */
export async function putVaultSecret(path: string, data: any): Promise<void> {
  if (USE_LOCAL_SECRETS) {
    console.log(`[Vault] Would store secret at: ${path} (local mode)`);
    return;
  }

  const VAULT_ADDR = process.env.VAULT_ADDR || "http://vault:8200";
  const VAULT_TOKEN = process.env.VAULT_TOKEN || "";

  const response = await fetch(`${VAULT_ADDR}/v1/secret/data/${path}`, {
    method: "POST",
    headers: {
      "X-Vault-Token": VAULT_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    throw new Error(`Vault secret store failed: ${response.statusText}`);
  }
}
