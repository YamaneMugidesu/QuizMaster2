-- Migration to add 'allow_one_attempt' column to quiz_configs table

-- Check if column exists before adding it to avoid errors on re-run
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quiz_configs' 
        AND column_name = 'allow_one_attempt'
    ) THEN
        ALTER TABLE quiz_configs
        ADD COLUMN allow_one_attempt BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Optional: Add comment
COMMENT ON COLUMN quiz_configs.allow_one_attempt IS 'If true, users can only take this quiz once (successful completion)';
