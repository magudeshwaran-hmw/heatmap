-- ============================================================
-- ZENASSESS V10 BACKEND FIXES MIGRATION
-- Date: June 6, 2026
-- Purpose: Fix grade-based path assignment and add pass/fail enforcement
-- ============================================================

-- Add missing columns to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tertiary_skill VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade VARCHAR(50);

-- Note: Table already exists with session_id, level_path, etc.
-- We're just adding new columns to existing table

-- Add columns if table already exists (safe for existing deployments)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='zenassess_sessions' AND column_name='passed') THEN
    ALTER TABLE zenassess_sessions ADD COLUMN passed BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='zenassess_sessions' AND column_name='pass_threshold') THEN
    ALTER TABLE zenassess_sessions ADD COLUMN pass_threshold INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='zenassess_sessions' AND column_name='attempt_number') THEN
    ALTER TABLE zenassess_sessions ADD COLUMN attempt_number INTEGER DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='zenassess_sessions' AND column_name='session_data') THEN
    ALTER TABLE zenassess_sessions ADD COLUMN session_data JSONB;
  END IF;
END $$;

-- Create indexes for performance (using level_path column)
CREATE INDEX IF NOT EXISTS idx_zenassess_employee ON zenassess_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_zenassess_level_path ON zenassess_sessions(level_path);
CREATE INDEX IF NOT EXISTS idx_zenassess_retake ON zenassess_sessions(employee_id, level_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zenassess_passed ON zenassess_sessions(passed);

-- Add comment for documentation
COMMENT ON TABLE zenassess_sessions IS 'Stores ZenAssess V10 assessment attempts with pass/fail tracking and retake cooldown enforcement';
COMMENT ON COLUMN zenassess_sessions.passed IS 'TRUE if score >= pass_threshold, FALSE otherwise';
COMMENT ON COLUMN zenassess_sessions.pass_threshold IS 'Required score percentage: 60 (Beginner), 65 (Intermediate), 70 (Expert)';
COMMENT ON COLUMN zenassess_sessions.attempt_number IS 'Sequential attempt number for retake tracking';
COMMENT ON COLUMN zenassess_sessions.session_data IS 'Full assessment session data in JSON format';

-- Update existing records to set pass_threshold based on level_path
UPDATE zenassess_sessions 
SET pass_threshold = CASE 
  WHEN level_path = 'beginner' OR level_path = 'Beginner' THEN 60
  WHEN level_path = 'intermediate' OR level_path = 'Intermediate' THEN 65
  WHEN level_path = 'expert' OR level_path = 'Expert' OR level_path = 'senior' THEN 70
  WHEN level_path = 'junior' THEN 60
  WHEN level_path = 'midlevel' THEN 65
  ELSE 60
END
WHERE pass_threshold IS NULL;

-- Update existing records to calculate passed status
UPDATE zenassess_sessions 
SET passed = (score >= pass_threshold)
WHERE passed IS NULL;

-- Verification query
SELECT 
  'Migration Complete' as status,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE passed = TRUE) as passed_sessions,
  COUNT(*) FILTER (WHERE passed = FALSE) as failed_sessions
FROM zenassess_sessions;

-- Display sample of updated records
SELECT 
  employee_id, 
  level_path, 
  score, 
  pass_threshold, 
  passed,
  created_at 
FROM zenassess_sessions 
ORDER BY created_at DESC 
LIMIT 5;
