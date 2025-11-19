/**
 * BRIQUE TRANSLATION — Core Translation Service
 *
 * Lookup order:
 * 1. Check overrides (manual Ops corrections)
 * 2. Check cache (previous translations)
 * 3. Call external API (LibreTranslate)
 * 4. Cache result and return
 */
import { pool } from "../db";
import { postTranslate } from "../utils/httpClient";
import {
  translationRequests,
  translationCacheHits,
  translationLatency,
  translationErrors
} from "../utils/metrics";

const API_URL = process.env.TRANSLATION_API || "http://libretranslate:5000/translate";

export async function translateText(
  source: string,
  sourceLang: string,
  targetLang: string,
  namespace = "default"
): Promise<string> {
  translationRequests.inc({ source: sourceLang, target: targetLang, namespace });

  const start = Date.now();

  try {
    // 1) Check override (highest priority)
    const override = await pool.query(
      `SELECT override_text FROM translation_overrides
       WHERE source_text=$1 AND target_lang=$2 AND namespace=$3 LIMIT 1`,
      [source, targetLang, namespace]
    );

    if (override.rowCount && override.rows.length > 0) {
      translationCacheHits.inc({ source: sourceLang, target: targetLang, namespace });
      translationLatency.observe(
        { source: sourceLang, target: targetLang, namespace },
        (Date.now() - start) / 1000
      );
      return override.rows[0].override_text;
    }

    // 2) Check cache
    const cached = await pool.query(
      `SELECT translated_text FROM translation_cache
       WHERE source_text=$1 AND source_lang=$2 AND target_lang=$3 AND namespace=$4 LIMIT 1`,
      [source, sourceLang, targetLang, namespace]
    );

    if (cached.rowCount && cached.rows.length > 0) {
      translationCacheHits.inc({ source: sourceLang, target: targetLang, namespace });
      translationLatency.observe(
        { source: sourceLang, target: targetLang, namespace },
        (Date.now() - start) / 1000
      );
      return cached.rows[0].translated_text;
    }

    // 3) Call external API (LibreTranslate)
    try {
      const apiBase = API_URL.replace('/translate', '');
      const data = await postTranslate(apiBase, source, sourceLang, targetLang);
      const translated = data.translatedText || source;

      // 4) Save to cache
      await cacheResult(source, sourceLang, targetLang, namespace, translated, 0.85);

      translationLatency.observe(
        { source: sourceLang, target: targetLang, namespace },
        (Date.now() - start) / 1000
      );

      return translated;
    } catch (apiError: any) {
      // Degrade gracefully: return source text, cache with low confidence
      console.error(`Translation API error: ${apiError.message}`);
      translationErrors.inc({
        source: sourceLang,
        target: targetLang,
        namespace,
        error_type: "api_failure"
      });

      await cacheResult(source, sourceLang, targetLang, namespace, source, 0.0);

      translationLatency.observe(
        { source: sourceLang, target: targetLang, namespace },
        (Date.now() - start) / 1000
      );

      return source;
    }
  } catch (error: any) {
    translationErrors.inc({
      source: sourceLang,
      target: targetLang,
      namespace,
      error_type: "service_error"
    });

    console.error(`Translation service error: ${error.message}`);
    return source; // fallback
  }
}

async function cacheResult(
  source: string,
  sourceLang: string,
  targetLang: string,
  namespace: string,
  translated: string,
  confidence: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO translation_cache(source_text, source_lang, target_lang, translated_text, confidence, namespace)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [source, sourceLang, targetLang, translated, confidence, namespace]
    );
  } catch (error: any) {
    console.error(`Cache insert error: ${error.message}`);
  }
}
