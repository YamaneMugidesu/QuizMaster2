-- Migration to add 'last_reset_at' column to quiz_configs table

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quiz_configs' 
        AND column_name = 'last_reset_at'
    ) THEN
        ALTER TABLE quiz_configs
        ADD COLUMN last_reset_at BIGINT DEFAULT 0;
    END IF;
END $$;

-- Optional: Add comment
COMMENT ON COLUMN quiz_configs.last_reset_at IS 'Timestamp (ms) of the last time attempts were reset for this quiz. Only results after this time count towards restrictions.';
