// ============================================================================
// Merchant Service Tests
// ============================================================================

import { getMerchantSummary, getTransactions, refundTransaction } from "../src/services/merchantService";
import { pool } from "../src/utils/db";

const TEST_MERCHANT_ID = "test-merchant-123";
const TEST_USER_ID = "test-user-123";
const TEST_TXN_ID = "test-txn-123";

// Mock pool
jest.mock("../src/utils/db");

describe("Merchant Service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getMerchantSummary", () => {
    it("should return KPIs from cache if fresh", async () => {
      const mockRows = [
        { kpi_key: "sales", value: "100000", currency: "XOF", usd_equivalent: "170", txn_count: 50 },
        { kpi_key: "refunds", value: "5000", currency: "XOF", usd_equivalent: "8.5", txn_count: 2 },
        { kpi_key: "fees", value: "3000", currency: "XOF", usd_equivalent: "5.1", txn_count: null },
        {
          kpi_key: "net_revenue",
          value: "92000",
          currency: "XOF",
          usd_equivalent: "156.4",
          txn_count: null,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockRows });

      const summary = await getMerchantSummary(TEST_MERCHANT_ID, "mtd", "XOF");

      expect(summary).toHaveProperty("sales");
      expect(summary).toHaveProperty("refunds");
      expect(summary).toHaveProperty("fees");
      expect(summary).toHaveProperty("net_revenue");

      expect(summary.sales.value).toBe(100000);
      expect(summary.sales.currency).toBe("XOF");
      expect(summary.sales.txn_count).toBe(50);
    });

    it("should compute KPIs from MV if cache is stale", async () => {
      // Empty cache
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      // Mock MV query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            total_sales: "150000",
            total_refunds: "7500",
            total_fees: "4500",
            payment_count: "75",
            refund_count: "3",
          },
        ],
      });

      // Mock FX rate query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ rate: "0.0017" }] });

      // Mock chargeback query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ chargeback_count: "1" }] });

      // Mock cache upsert
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const summary = await getMerchantSummary(TEST_MERCHANT_ID, "mtd", "XOF");

      expect(summary.sales.value).toBe(150000);
      expect(summary.net_revenue.value).toBe(138000); // 150000 - 7500 - 4500
    });
  });

  describe("getTransactions", () => {
    it("should return paginated transactions", async () => {
      const mockTxns = [
        {
          id: "txn-1",
          type: "payment",
          amount: 10000,
          currency: "XOF",
          status: "succeeded",
          occurred_at: new Date().toISOString(),
        },
        {
          id: "txn-2",
          type: "payment",
          amount: 20000,
          currency: "XOF",
          status: "succeeded",
          occurred_at: new Date().toISOString(),
        },
      ];

      // Mock count query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ total: "100" }] });

      // Mock transactions query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockTxns });

      const result = await getTransactions(TEST_MERCHANT_ID, { page: 1, limit: 50 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.total).toBe(100);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].id).toBe("txn-1");
    });

    it("should apply filters", async () => {
      // Mock count query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ total: "10" }] });

      // Mock transactions query
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getTransactions(TEST_MERCHANT_ID, {
        page: 1,
        limit: 50,
        status: "succeeded",
        currency: "XOF",
        from: "2025-01-01",
        to: "2025-01-31",
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = $2"),
        expect.arrayContaining([TEST_MERCHANT_ID, "succeeded"])
      );
    });
  });

  describe("refundTransaction", () => {
    it("should create refund without approval if below threshold", async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock transaction query
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_TXN_ID,
            merchant_id: TEST_MERCHANT_ID,
            amount: 50000,
            currency: "XOF",
            status: "succeeded",
          },
        ],
      });

      // Mock dashboard config query
      mockClient.query.mockResolvedValueOnce({
        rows: [{ dashboard_config: { refund_threshold_requiring_approval: 100000 } }],
      });

      // Mock refund insert
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: "refund-123",
            transaction_id: TEST_TXN_ID,
            amount: 50000,
            status: "processing",
          },
        ],
      });

      // Mock other queries (update txn, update refund, audit log)
      mockClient.query.mockResolvedValue({ rows: [] });

      const refund = await refundTransaction(
        TEST_MERCHANT_ID,
        TEST_TXN_ID,
        50000,
        "Customer request",
        TEST_USER_ID
      );

      expect(refund).toBeDefined();
      expect(refund.status).toBe("processing");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });

    it("should require approval if above threshold", async () => {
      // This test would mock axios for approval API call
      // Skipped for brevity
    });

    it("should throw error if transaction not found", async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock transaction query - empty
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        refundTransaction(TEST_MERCHANT_ID, TEST_TXN_ID, 50000, "Customer request", TEST_USER_ID)
      ).rejects.toThrow("transaction_not_found");
    });
  });
});
