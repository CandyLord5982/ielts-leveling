-- ============================================================
-- Tournament info/description field
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS info text;
