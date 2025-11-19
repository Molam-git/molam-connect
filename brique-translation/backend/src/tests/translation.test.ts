/**
 * BRIQUE TRANSLATION — Translation Service Tests
 */
import { translateText } from "../services/translationService";
import { pool } from "../db";

describe("Translation Service", () => {
  beforeAll(async () => {
    // Ensure DB is connected
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(
      `DELETE FROM translation_cache WHERE namespace = 'test'`
    );
    await pool.query(
      `DELETE FROM translation_overrides WHERE namespace = 'test'`
    );
    await pool.end();
  });

  test("translateText returns a string", async () => {
    const result = await translateText("Hello", "en", "fr", "test");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("override is respected over cache", async () => {
    const sourceText = "TestOverrideUnique123";

    // Create override
    await pool.query(
      `INSERT INTO translation_overrides(source_text, target_lang, override_text, namespace)
       VALUES ($1,$2,$3,$4)`,
      [sourceText, "fr", "OVERRIDE_RESULT", "test"]
    );

    const result = await translateText(sourceText, "en", "fr", "test");
    expect(result).toBe("OVERRIDE_RESULT");
  });

  test("cache is used on second request", async () => {
    const sourceText = "UniqueTestPhrase456";

    // First request (miss cache)
    const result1 = await translateText(sourceText, "en", "fr", "test");

    // Second request (should hit cache)
    const result2 = await translateText(sourceText, "en", "fr", "test");

    expect(result1).toBe(result2);

    // Verify it was cached
    const { rows } = await pool.query(
      `SELECT * FROM translation_cache WHERE source_text=$1 AND namespace=$2`,
      [sourceText, "test"]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("gracefully degrades when API fails", async () => {
    // This will fail if LibreTranslate is down, but should return source text
    const result = await translateText(
      "TestFailureHandling",
      "en",
      "zz", // invalid language
      "test"
    );

    // Should fallback to source text
    expect(typeof result).toBe("string");
  });
});
