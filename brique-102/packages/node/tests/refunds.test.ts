/**
 * Refunds tests
 */
import { MolamClient } from "../src/client";

describe("RefundsResource", () => {
  const client = new MolamClient({
    baseUrl: "http://localhost:9000",
    apiKey: "test_key"
  });

  test("refunds surface exists", () => {
    expect(typeof client.refunds.create).toBe("function");
    expect(typeof client.refunds.retrieve).toBe("function");
    expect(typeof client.refunds.list).toBe("function");
  });
});
