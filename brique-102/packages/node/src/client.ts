/**
 * Main Molam SDK Client
 */
import { HttpClient } from "./http";
import { MolamClientOptions } from "./types";
import { PaymentsResource } from "./resources/payments";
import { RefundsResource } from "./resources/refunds";
import { WebhooksResource } from "./resources/webhooks";

export class MolamClient {
  public payments: PaymentsResource;
  public refunds: RefundsResource;
  public webhooks: WebhooksResource;
  private http: HttpClient;

  constructor(opts: MolamClientOptions) {
    if (!opts.apiKey || !opts.baseUrl) {
      throw new Error("MolamClient requires baseUrl and apiKey");
    }

    this.http = new HttpClient({
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries
    });

    this.payments = new PaymentsResource(this.http);
    this.refunds = new RefundsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
  }

  /**
   * Static method to verify webhook signatures
   */
  static async verifyWebhook(
    raw: Buffer | string,
    signatureHeader: string,
    getSecret: (kid: string) => string
  ): Promise<boolean> {
    const crypto = await import("crypto");

    const parts = Object.fromEntries(
      signatureHeader.split(",").map(p => p.split("=") as [string,string])
    );

    const t = parts["t"];
    const v1 = parts["v1"];
    const kid = parts["kid"] || "v1";

    if (!t || !v1) {
      throw new Error("Invalid signature header");
    }

    // Check timestamp
    const timestamp = Number(t);
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      throw new Error("Signature timestamp outside tolerance");
    }

    // Get secret by kid
    const secret = getSecret(kid);
    if (!secret) {
      throw new Error(`No secret found for kid: ${kid}`);
    }

    // Compute HMAC
    const payload = typeof raw === "string" ? raw : raw.toString("utf8");
    const computed = crypto
      .createHmac("sha256", secret)
      .update(`${t}.${payload}`)
      .digest("hex");

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(v1, "hex"),
      Buffer.from(computed, "hex")
    );
  }
}
