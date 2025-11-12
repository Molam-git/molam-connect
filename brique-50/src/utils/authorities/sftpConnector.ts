/**
 * Brique 50 - Fiscal Reporting
 * SFTP Connector for Authority Submission
 */

// @ts-ignore - ssh2-sftp-client doesn't have proper types
import Client from "ssh2-sftp-client";
import { getVaultSecret } from "../vault.js";
import { downloadFromS3 } from "../s3.js";

interface SubmissionResponse {
  status: string;
  ref: string;
  raw: any;
}

export const sftpConnector = {
  async send(channel: any, artifactS3Key: string): Promise<SubmissionResponse> {
    const sftp = new Client();

    try {
      // Fetch credentials from Vault
      const cred = await getVaultSecret(channel.vault_ref);

      // Connect to SFTP server
      await sftp.connect({
        host: channel.endpoint,
        port: cred.port || 22,
        username: cred.user || cred.username,
        password: cred.pass || cred.password,
        readyTimeout: 30000,
      });

      // Download artifact from S3
      const artifactData = await downloadFromS3(artifactS3Key);

      // Upload to SFTP
      const filename = artifactS3Key.split("/").pop() || `report_${Date.now()}`;
      const remotePath = `/inbound/${filename}`;

      await sftp.put(artifactData, remotePath);

      await sftp.end();

      return {
        status: "submitted",
        ref: `sftp:${remotePath}`,
        raw: { path: remotePath, size: artifactData.length },
      };
    } catch (err: any) {
      console.error("[SFTP Connector] Submission error:", err);

      try {
        await sftp.end();
      } catch {
        // Ignore close errors
      }

      return {
        status: "error",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
