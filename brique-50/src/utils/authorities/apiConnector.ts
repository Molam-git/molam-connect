/**
 * Brique 50 - Fiscal Reporting
 * API Connector for Authority Submission
 */

import { getVaultSecret } from "../vault.js";
import { downloadFromS3 } from "../s3.js";

interface SubmissionResponse {
  status: string;
  ref: string;
  raw: any;
}

export const apiConnector = {
  async send(channel: any, artifactS3Key: string): Promise<SubmissionResponse> {
    try {
      const url = `${channel.endpoint}/submit`;

      // Fetch credentials from Vault using channel.vault_ref
      const cred = await getVaultSecret(channel.vault_ref);
      const token = cred.api_token || cred.api_key;

      // Download artifact from S3
      const artifactData = await downloadFromS3(artifactS3Key);

      // Prepare payload based on format
      let payload: any;
      let contentType: string;

      if (channel.format === "JSON") {
        payload = JSON.parse(artifactData.toString("utf8"));
        contentType = "application/json";
      } else if (channel.format === "XML") {
        payload = artifactData.toString("utf8");
        contentType = "application/xml";
      } else {
        // For CSV or PDF, send as multipart/form-data
        payload = {
          file: artifactData.toString("base64"),
          filename: artifactS3Key.split("/").pop(),
        };
        contentType = "application/json";
      }

      // Call authority API
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`API submission failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      return {
        status: data.status === "accepted" || data.accepted ? "accepted" : "submitted",
        ref: data.reference || data.ref || data.id || `api-${Date.now()}`,
        raw: data,
      };
    } catch (err: any) {
      console.error("[API Connector] Submission error:", err);
      return {
        status: "error",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
