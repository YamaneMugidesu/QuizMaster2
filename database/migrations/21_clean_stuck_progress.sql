-- 21_clean_stuck_progress.sql
-- Force clean stuck/corrupted quiz sessions
-- This is necessary to clear out sessions that were created with incomplete data due to permission errors.

-- 1. Delete all IN_PROGRESS sessions
-- This forces all users to start fresh on their next attempt.
DELETE FROM public.quiz_progress;

-- 2. Optional: Add a check constraint to prevent empty questions in future?
-- Not strictly necessary now, but good practice.
-- ALTER TABLE public.quiz_progress ADD CONSTRAINT check_questions_not_empty CHECK (jsonb_array_length(questions) > 0);
