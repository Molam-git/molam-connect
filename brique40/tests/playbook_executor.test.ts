// tests/playbook_executor.test.ts
import { executeStep } from "../src/utils/executeStep";
import { pool } from "../src/db";

describe("playbook executeStep", () => {
    it("executes ledger_hold", async () => {
        const step = { type: "ledger_hold", name: "create_hold", params: { amount: 10 } };
        const ctx = { fraudCase: { id: "00000000-0000-0000-0000-000000000000", score: 0.9 } };
        const res = await executeStep(step, ctx);
        expect(res.ok).toBeTruthy();
    });

    afterAll(async () => { await pool.end(); });
});