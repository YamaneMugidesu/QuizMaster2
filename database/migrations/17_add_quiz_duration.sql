
-- Add duration column to quiz_configs table
-- duration is in minutes. 0 or null means no time limit.

ALTER TABLE public.quiz_configs 
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;

-- Comment on column
COMMENT ON COLUMN public.quiz_configs.duration IS 'Quiz duration limit in minutes. 0 means no limit.';
