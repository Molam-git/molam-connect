/**
 * Brique 50 - Fiscal Reporting
 * Portal Connector for Authority Submission (using Playwright for automation)
 */

import { chromium } from "playwright";
import { getVaultSecret } from "../vault.js";
import { downloadFromS3 } from "../s3.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

interface SubmissionResponse {
  status: string;
  ref: string;
  raw: any;
}

export const portalConnector = {
  async send(channel: any, artifactS3Key: string): Promise<SubmissionResponse> {
    let browser;

    try {
      // Fetch credentials from Vault
      const cred = await getVaultSecret(channel.vault_ref);

      // Download artifact from S3
      const artifactData = await downloadFromS3(artifactS3Key);

      // Save to temp file
      const tmpDir = os.tmpdir();
      const filename = artifactS3Key.split("/").pop() || `report_${Date.now()}.pdf`;
      const tmpPath = path.join(tmpDir, filename);
      await fs.writeFile(tmpPath, artifactData);

      // Launch browser
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();

      // Navigate to portal
      await page.goto(channel.endpoint, { waitUntil: "networkidle", timeout: 30000 });

      // Generic login sequence (customize per authority)
      await page.fill('input[name="username"], input[type="email"], input#username', cred.user || cred.username || "");
      await page.fill('input[name="password"], input[type="password"], input#password', cred.pass || cred.password || "");
      await page.click('button[type="submit"], input[type="submit"], button#login');

      // Wait for navigation after login
      await page.waitForLoadState("networkidle", { timeout: 30000 });

      // Navigate to upload section (authority-specific selectors)
      // This is a generic implementation - customize per authority
      const uploadButton = await page
        .locator('button:has-text("Upload"), a:has-text("Upload"), button:has-text("Submit")')
        .first();
      if (uploadButton) {
        await uploadButton.click();
      }

      // File upload
      const fileInput = await page.locator('input[type="file"]').first();
      if (fileInput) {
        await fileInput.setInputFiles(tmpPath);
      }

      // Submit
      await page.click('button[type="submit"]:has-text("Submit"), button#submit, input[type="submit"]');

      // Wait for confirmation
      await page.waitForLoadState("networkidle", { timeout: 30000 });

      // Try to extract confirmation reference
      let ref = `portal:${Date.now()}`;
      try {
        const confirmationElement = await page
          .locator('#confirmation, .confirmation, [class*="reference"]')
          .first()
          .textContent({ timeout: 5000 });
        if (confirmationElement) {
          ref = confirmationElement.trim();
        }
      } catch {
        // Fallback to default ref
      }

      // Cleanup
      await browser.close();
      await fs.unlink(tmpPath);

      return {
        status: "submitted",
        ref,
        raw: { confirmation: ref, portal: channel.endpoint },
      };
    } catch (err: any) {
      console.error("[Portal Connector] Submission error:", err);

      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }
      }

      return {
        status: "error",
        ref: `error-${Date.now()}`,
        raw: { error: err.message },
      };
    }
  },
};
