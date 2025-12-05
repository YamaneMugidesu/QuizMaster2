-- Add duration column to quiz_results table
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS duration INTEGER;

-- Optional: Update existing records to have a default value (e.g., 0 or NULL) if needed
-- UPDATE quiz_results SET duration = 0 WHERE duration IS NULL;
