/**
 * Webhooks resource and verification helpers
 */
import { HttpClient } from "../http";
import crypto from "crypto";

export class WebhooksResource {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Verify webhook signature (HMAC-SHA256)
   * @param payloadRaw - Raw webhook payload as string
   * @param signatureHeader - Molam-Signature header value
   * @param secret - Webhook secret
   * @returns true if signature is valid
   */
  async verifySignature(payloadRaw: string, signatureHeader: string, secret: string): Promise<boolean> {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map(p => p.split("=") as [string,string])
    );

    const t = parts["t"];
    const v1 = parts["v1"];

    if (!t || !v1) {
      throw new Error("Invalid signature header format");
    }

    // Check timestamp (5-minute tolerance)
    const timestamp = Number(t);
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      throw new Error("Signature timestamp outside tolerance");
    }

    // Compute HMAC
    const computed = crypto
      .createHmac("sha256", secret)
      .update(`${t}.${payloadRaw}`)
      .digest("hex");

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(v1, "hex"),
      Buffer.from(computed, "hex")
    );
  }

  /**
   * Create a webhook endpoint via Molam API
   */
  async createEndpoint(tenantType: string, tenantId: string, url: string, events: string[]) {
    const payload = {
      tenant_type: tenantType,
      tenant_id: tenantId,
      url,
      events
    };
    return this.http.post("/v1/webhooks/endpoints", payload);
  }

  /**
   * List webhook endpoints
   */
  async listEndpoints(tenantType: string, tenantId: string) {
    return this.http.get(`/v1/webhooks/endpoints?tenant_type=${tenantType}&tenant_id=${tenantId}`);
  }

  /**
   * Delete a webhook endpoint
   */
  async deleteEndpoint(endpointId: string) {
    return this.http.delete(`/v1/webhooks/endpoints/${endpointId}`);
  }
}
