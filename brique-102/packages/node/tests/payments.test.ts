/**
 * Payment Intents tests
 */
import { MolamClient } from "../src/client";

describe("PaymentsResource", () => {
  const client = new MolamClient({
    baseUrl: "http://localhost:4000",
    apiKey: "sk_test_123",
    maxRetries: 0
  });

  test("payments surface exists", () => {
    expect(typeof client.payments.create).toBe("function");
    expect(typeof client.payments.confirm).toBe("function");
    expect(typeof client.payments.retrieve).toBe("function");
    expect(typeof client.payments.cancel).toBe("function");
    expect(typeof client.payments.list).toBe("function");
  });
});
