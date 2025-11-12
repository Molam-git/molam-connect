/**
 * Payment Method Service - tokenization and vault management
 */
import { pool } from "../utils/db.js";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.VAULT_ENCRYPTION_KEY || "default-32-byte-encryption-key!";

export interface CreatePaymentMethodInput {
  customerId: string;
  merchantId?: string;
  type: "card" | "sepa_debit" | "ach_debit" | "bank_transfer" | "wallet";
  provider: string;
  token: string;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  sepaMandateRef?: string;
  sepaMandatePdfS3?: string;
  isDefault?: boolean;
}

export async function createPaymentMethod(input: CreatePaymentMethodInput): Promise<any> {
  const encryptedToken = encrypt(input.token);

  // If setting as default, unset other defaults
  if (input.isDefault) {
    await pool.query(
      "UPDATE payment_methods SET is_default = false WHERE customer_id = $1 AND type = $2",
      [input.customerId, input.type]
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_methods (
      customer_id, merchant_id, type, provider, token,
      last4, brand, exp_month, exp_year,
      sepa_mandate_ref, sepa_mandate_pdf_s3, is_default
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, customer_id, merchant_id, type, provider, last4, brand, exp_month, exp_year, sepa_mandate_ref, status, is_default, created_at`,
    [
      input.customerId,
      input.merchantId || null,
      input.type,
      input.provider,
      encryptedToken,
      input.last4 || null,
      input.brand || null,
      input.expMonth || null,
      input.expYear || null,
      input.sepaMandateRef || null,
      input.sepaMandatePdfS3 || null,
      input.isDefault || false,
    ]
  );

  return rows[0];
}

export async function getPaymentMethod(id: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT id, customer_id, merchant_id, type, provider, last4, brand, exp_month, exp_year, sepa_mandate_ref, status, is_default, created_at
     FROM payment_methods WHERE id = $1`,
    [id]
  );

  return rows[0] || null;
}

export async function getDecryptedToken(id: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT token FROM payment_methods WHERE id = $1", [id]);
  if (!rows.length) return null;

  return decrypt(rows[0].token);
}

export async function listPaymentMethods(customerId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, customer_id, merchant_id, type, provider, last4, brand, exp_month, exp_year, sepa_mandate_ref, status, is_default, created_at
     FROM payment_methods WHERE customer_id = $1 AND status = 'active'
     ORDER BY is_default DESC, created_at DESC`,
    [customerId]
  );

  return rows;
}

export async function deletePaymentMethod(id: string): Promise<void> {
  await pool.query("UPDATE payment_methods SET status = 'inactive', updated_at = now() WHERE id = $1", [
    id,
  ]);
}

// Simple AES-256-GCM encryption
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").substring(0, 32)),
    iv
  );

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").substring(0, 32)),
    iv
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
