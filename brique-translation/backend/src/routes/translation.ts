/**
 * BRIQUE TRANSLATION — Public Translation API Routes
 */
import express from "express";
import { translateText } from "../services/translationService";
import { pool } from "../db";

export const translationRouter = express.Router();

/**
 * POST /api/translate
 * body: { text, sourceLang, targetLang, namespace? }
 */
translationRouter.post("/translate", async (req, res) => {
  const { text, sourceLang, targetLang, namespace } = req.body;

  if (!text || !sourceLang || !targetLang) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    const translated = await translateText(
      text,
      sourceLang,
      targetLang,
      namespace || "default"
    );
    res.json({ text: translated });
  } catch (e: any) {
    res.status(500).json({ error: "translation_error", detail: e.message });
  }
});

/**
 * POST /api/feedback
 * body: { sourceText, wrongTranslation, correctedTranslation, targetLang, userId? }
 */
translationRouter.post("/feedback", async (req, res) => {
  const { sourceText, wrongTranslation, correctedTranslation, targetLang, userId } = req.body;

  if (!sourceText || !correctedTranslation || !targetLang) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    await pool.query(
      `INSERT INTO translation_feedback(source_text, wrong_translation, corrected_translation, target_lang, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [sourceText, wrongTranslation || "", correctedTranslation, targetLang, userId || null]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "feedback_error", detail: e.message });
  }
});
