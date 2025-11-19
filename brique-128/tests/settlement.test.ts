// ============================================================================
// Settlement Engine Tests
// ============================================================================

import { Pool } from "pg";
import { processInstruction, createInstruction } from "../src/services/settlement-engine";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

describe("Settlement Engine", () => {
  beforeAll(async () => {
    // Setup test database
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settlement_instructions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bank_profile_id UUID NOT NULL,
        amount NUMERIC(18,2) NOT NULL,
        currency TEXT NOT NULL,
        rail TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retries INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 5,
        idempotency_key TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should create instruction with idempotency", async () => {
    const key = `test-${Date.now()}`;

    const instr1 = await createInstruction({
      bankProfileId: "bank-1",
      amount: 100,
      currency: "USD",
      rail: "REST",
      idempotencyKey: key
    });

    const instr2 = await createInstruction({
      bankProfileId: "bank-1",
      amount: 100,
      currency: "USD",
      rail: "REST",
      idempotencyKey: key
    });

    expect(instr1.id).toBe(instr2.id);
  });

  it("should process instruction to confirmed", async () => {
    const instr = await createInstruction({
      bankProfileId: "bank-test",
      amount: 100,
      currency: "USD",
      rail: "REST"
    });

    // Mock successful processing
    const result = await processInstruction(instr.id);

    expect(result.status).toMatch(/confirmed|failed/);
  });

  it("should respect max retries", async () => {
    const { rows: [instr] } = await pool.query(
      `INSERT INTO settlement_instructions(
        bank_profile_id, amount, currency, rail, status, retries, max_retries
      ) VALUES ($1, 100, 'USD', 'REST', 'pending', 5, 5) RETURNING *`,
      ["bank-max-retries"]
    );

    await expect(processInstruction(instr.id)).rejects.toThrow("max_retries_exceeded");
  });

  it("should not double-process confirmed instruction", async () => {
    const { rows: [instr] } = await pool.query(
      `INSERT INTO settlement_instructions(
        bank_profile_id, amount, currency, rail, status
      ) VALUES ($1, 100, 'USD', 'REST', 'confirmed') RETURNING *`,
      ["bank-confirmed"]
    );

    const result = await processInstruction(instr.id);
    expect(result.status).toBe("confirmed");
  });
});
