/**
 * Simple integration test for the example webhook receiver using supertest
 */
import request from "supertest";
import crypto from "crypto";
import { createWebhookApp } from "../src/examples/webhook_receiver";

describe("Webhook receiver example", () => {
  const secret = "test_secret_32bytes";
  let app: any;

  beforeAll(() => {
    app = createWebhookApp({ secret });
  });

  test("valid signature accepted", async () => {
    const payload = { id: "evt_1", type: "payment.succeeded", data: { amount: 100 } };
    const raw = JSON.stringify(payload);
    const t = String(Date.now());
    const v1 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
    const header = `t=${t},v1=${v1},kid=1`;

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("Molam-Signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("invalid signature rejected", async () => {
    const payload = { id: "evt_2" };
    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("Molam-Signature", `t=${Date.now()},v1=deadbeef,kid=1`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  test("health check works", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
