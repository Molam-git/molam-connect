/**
 * Webhook verification tests
 */
import { MolamClient } from "../src/client";
import crypto from "crypto";

describe("Webhook verification", () => {
  const secret = "test_secret_key_12345678901234567890";

  test("verifies valid signature", async () => {
    const payload = JSON.stringify({ id: "evt_123", type: "payment.succeeded" });
    const timestamp = Date.now().toString();

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const sigHeader = `t=${timestamp},v1=${signature},kid=v1`;

    const result = await MolamClient.verifyWebhook(
      payload,
      sigHeader,
      (kid) => secret
    );

    expect(result).toBe(true);
  });

  test("rejects invalid signature", async () => {
    const payload = JSON.stringify({ id: "evt_123" });
    const timestamp = Date.now().toString();
    const sigHeader = `t=${timestamp},v1=invalid_signature,kid=v1`;

    await expect(
      MolamClient.verifyWebhook(payload, sigHeader, () => secret)
    ).rejects.toThrow();
  });

  test("rejects expired timestamp", async () => {
    const payload = JSON.stringify({ id: "evt_123" });
    const timestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const sigHeader = `t=${timestamp},v1=${signature},kid=v1`;

    await expect(
      MolamClient.verifyWebhook(payload, sigHeader, () => secret)
    ).rejects.toThrow("timestamp outside tolerance");
  });
});
