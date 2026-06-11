-- ============================================================
-- ZENASSESS BADGE SYNC MIGRATION
-- Date: June 8, 2026
-- Purpose: Persist verified/self-claimed badge levels and silent
--          tier-drop outcomes. All columns default to NULL/FALSE
--          and are backward compatible with existing rows.
-- ============================================================

ALTER TABLE skills ADD COLUMN IF NOT EXISTS verified_badge_level VARCHAR(50) DEFAULT NULL;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS self_claimed_level   VARCHAR(50) DEFAULT NULL;

ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS silent_drop_path           VARCHAR(120) DEFAULT NULL;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS badge_awarded              BOOLEAN DEFAULT FALSE;
ALTER TABLE zenassess_sessions ADD COLUMN IF NOT EXISTS self_claimed_level_at_test VARCHAR(50) DEFAULT NULL;
