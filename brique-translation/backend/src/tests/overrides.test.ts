/**
 * BRIQUE TRANSLATION — Overrides API Tests
 */
import { pool } from "../db";

describe("Translation Overrides", () => {
  const testNamespace = "test-overrides";

  afterAll(async () => {
    await pool.query(
      `DELETE FROM translation_overrides WHERE namespace = $1`,
      [testNamespace]
    );
    await pool.query(
      `DELETE FROM translation_audit WHERE namespace = $1`,
      [testNamespace]
    );
    await pool.end();
  });

  test("can create override", async () => {
    const { rows } = await pool.query(
      `INSERT INTO translation_overrides(source_text, target_lang, override_text, namespace)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      ["Test Source", "fr", "Test Override", testNamespace]
    );

    expect(rows.length).toBe(1);
    expect(rows[0].override_text).toBe("Test Override");
  });

  test("can retrieve overrides by namespace", async () => {
    const { rows } = await pool.query(
      `SELECT * FROM translation_overrides WHERE namespace = $1`,
      [testNamespace]
    );

    expect(rows.length).toBeGreaterThan(0);
  });

  test("can delete override", async () => {
    const { rows: created } = await pool.query(
      `INSERT INTO translation_overrides(source_text, target_lang, override_text, namespace)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ["Delete Test", "fr", "Override", testNamespace]
    );

    const id = created[0].id;

    const { rows: deleted } = await pool.query(
      `DELETE FROM translation_overrides WHERE id = $1 RETURNING *`,
      [id]
    );

    expect(deleted.length).toBe(1);
  });
});
