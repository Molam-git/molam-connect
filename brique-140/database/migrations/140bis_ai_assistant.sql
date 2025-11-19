-- =============================================================================
-- SOUS-BRIQUE 140bis — AI Dev Assistant (Sira Integrated)
-- Extension: Feedback table for Sira self-learning
-- =============================================================================

-- Table feedback Sira pour auto-apprentissage
CREATE TABLE IF NOT EXISTS dev_ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL,
  query TEXT NOT NULL,
  suggestion JSONB NOT NULL,
  lang TEXT,                            -- node|php|python
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback_text TEXT,
  was_helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_ai_feedback_developer ON dev_ai_feedback(developer_id);
CREATE INDEX IF NOT EXISTS idx_dev_ai_feedback_rating ON dev_ai_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_dev_ai_feedback_created ON dev_ai_feedback(created_at DESC);

COMMENT ON TABLE dev_ai_feedback IS 'Sira AI assistant feedback for self-learning and improvements';
