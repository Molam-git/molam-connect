/**
 * Full HTTP E2E test using Express sandbox + supertest
 * Simulates Molam API responses and ensures SDK works end-to-end
 */
import express from "express";
import bodyParser from "body-parser";
import { Server } from "http";
import { MolamClient } from "../src/client";

function makeSandbox() {
  const app = express();
  app.use(bodyParser.json());

  app.post("/v1/payment_intents", (req, res) => {
    return res.json({
      data: {
        id: "pi_sbx_1",
        status: "requires_confirmation",
        amount: req.body.payment_intent?.amount || 0,
        currency: req.body.payment_intent?.currency || "USD",
        merchant_id: req.body.payment_intent?.merchantId || "m_1",
        created_at: new Date().toISOString()
      }
    });
  });

  app.post("/v1/payment_intents/:id/confirm", (req, res) => {
    return res.json({
      data: {
        id: req.params.id,
        status: "succeeded",
        amount: 2000,
        currency: "USD",
        merchant_id: "m_1",
        created_at: new Date().toISOString()
      }
    });
  });

  app.get("/v1/payment_intents/:id", (req, res) => {
    return res.json({
      data: {
        id: req.params.id,
        status: "succeeded",
        amount: 2000,
        currency: "USD",
        merchant_id: "m_1",
        created_at: new Date().toISOString()
      }
    });
  });

  return app;
}

describe("E2E sandbox flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = makeSandbox();
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        done();
      }
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test("payment flow end-to-end", async () => {
    const client = new MolamClient({ baseUrl, apiKey: "sbx_test", maxRetries: 0 });

    const created = await client.payments.create({
      amount: 2000,
      currency: "USD",
      merchantId: "m_1"
    });

    expect(created.id).toContain("pi_sbx");

    const confirmed = await client.payments.confirm(created.id);
    expect(confirmed.status).toBe("succeeded");

    const retrieved = await client.payments.retrieve(created.id);
    expect(retrieved.status).toBe("succeeded");
  });
});
