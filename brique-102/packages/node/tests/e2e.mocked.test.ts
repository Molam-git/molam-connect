/**
 * E2E-style tests using axios-mock-adapter to simulate Molam API responses
 */
import MockAdapter from "axios-mock-adapter";
import axios from "axios";
import { MolamClient } from "../src/client";

describe("Molam SDK - mocked E2E", () => {
  let mock: MockAdapter;

  beforeAll(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.reset();
  });

  afterAll(() => {
    mock.restore();
  });

  test("create payment intent -> confirm -> retrieve flow", async () => {
    const baseUrl = "https://api.molam.test";
    const apiKey = "test_key";

    const piResp = {
      data: {
        id: "pi_123",
        amount: 1000,
        currency: "USD",
        status: "requires_confirmation",
        merchant_id: "m_1",
        created_at: new Date().toISOString()
      }
    };

    mock.onPost(`${baseUrl}/v1/payment_intents`).reply(201, piResp);
    mock.onPost(`${baseUrl}/v1/payment_intents/pi_123/confirm`).reply(200, {
      data: { ...piResp.data, status: "succeeded" }
    });
    mock.onGet(`${baseUrl}/v1/payment_intents/pi_123`).reply(200, {
      data: { ...piResp.data, status: "succeeded" }
    });

    const client = new MolamClient({ baseUrl, apiKey, maxRetries: 0 });

    const created = await client.payments.create({
      amount: 1000,
      currency: "USD",
      merchantId: "m_1",
      description: "Test intent"
    });

    expect(created.id).toBe("pi_123");
    expect(created.status).toBe("requires_confirmation");

    const confirmed = await client.payments.confirm(created.id);
    expect(confirmed.status).toBe("succeeded");

    const retrieved = await client.payments.retrieve(created.id);
    expect(retrieved.status).toBe("succeeded");
  });

  test("refund create -> retrieve", async () => {
    const baseUrl = "https://api.molam.test";
    const apiKey = "test_key";

    mock.onPost(`${baseUrl}/v1/refunds`).reply(201, {
      data: {
        id: "r_1",
        payment_id: "pi_123",
        amount: 500,
        status: "pending",
        created_at: new Date().toISOString()
      }
    });

    mock.onGet(`${baseUrl}/v1/refunds/r_1`).reply(200, {
      data: {
        id: "r_1",
        payment_id: "pi_123",
        amount: 500,
        status: "succeeded",
        created_at: new Date().toISOString()
      }
    });

    const client = new MolamClient({ baseUrl, apiKey, maxRetries: 0 });

    const refund = await client.refunds.create({
      paymentId: "pi_123",
      amount: 500
    });

    expect(refund.id).toBe("r_1");

    const fetched = await client.refunds.retrieve("r_1");
    expect(fetched.status).toBe("succeeded");
  });
});
