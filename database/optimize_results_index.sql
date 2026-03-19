-- Optimize quiz_results table indexes for faster querying
-- Create index on user_id for filtering user history
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results (user_id);

-- Create index on timestamp for sorting
CREATE INDEX IF NOT EXISTS idx_quiz_results_timestamp ON public.quiz_results (timestamp DESC);

-- Create composite index for user history queries (user_id + timestamp)
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_timestamp ON public.quiz_results (user_id, timestamp DESC);
