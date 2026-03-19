
-- Create quiz_progress table to track active quiz sessions
-- This prevents users from regenerating quizzes repeatedly to scrape questions
-- and allows for cross-device session resumption.

CREATE TABLE IF NOT EXISTS public.quiz_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    config_id UUID REFERENCES public.quiz_configs(id) ON DELETE CASCADE NOT NULL,
    start_time BIGINT NOT NULL,
    last_updated BIGINT NOT NULL,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of Question objects (without answers)
    answers JSONB DEFAULT '{}'::jsonb, -- Current answers map
    current_index INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    
    -- Ensure a user can only have one active session per quiz config
    UNIQUE(user_id, config_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_progress_user_config ON public.quiz_progress(user_id, config_id);
CREATE INDEX IF NOT EXISTS idx_quiz_progress_updated ON public.quiz_progress(last_updated DESC);

-- Enable RLS
ALTER TABLE public.quiz_progress ENABLE ROW LEVEL SECURITY;

-- Policies
-- Users can see their own progress
CREATE POLICY "Users can view own progress" ON public.quiz_progress
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "Users can create own progress" ON public.quiz_progress
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "Users can update own progress" ON public.quiz_progress
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own progress (e.g. when abandoning)
CREATE POLICY "Users can delete own progress" ON public.quiz_progress
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access on quiz_progress" ON public.quiz_progress
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
