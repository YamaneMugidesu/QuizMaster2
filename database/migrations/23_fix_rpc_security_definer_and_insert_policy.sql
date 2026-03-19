-- 23_fix_rpc_security_definer_and_insert_policy.sql

-- ==========================================
-- 1. Helper Functions (Security Definer & Permissions)
-- ==========================================

-- Recreate helper function with SECURITY DEFINER to ensure it runs with correct context
CREATE OR REPLACE FUNCTION public.arrays_equal_unordered(json_a JSONB, json_b JSONB) 
RETURNS BOOLEAN IMMUTABLE LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  arr_a TEXT[];
  arr_b TEXT[];
BEGIN
  -- Handle NULLs gracefully
  IF json_a IS NULL OR jsonb_typeof(json_a) = 'null' THEN json_a := '[]'::jsonb; END IF;
  IF json_b IS NULL OR jsonb_typeof(json_b) = 'null' THEN json_b := '[]'::jsonb; END IF;

  SELECT array_agg(elem ORDER BY elem) INTO arr_a FROM jsonb_array_elements_text(json_a) elem;
  SELECT array_agg(elem ORDER BY elem) INTO arr_b FROM jsonb_array_elements_text(json_b) elem;
  
  -- Handle empty arrays which result in NULL from array_agg
  IF arr_a IS NULL THEN arr_a := '{}'; END IF;
  IF arr_b IS NULL THEN arr_b := '{}'; END IF;
  
  RETURN arr_a = arr_b;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- Grant permissions on helpers
GRANT EXECUTE ON FUNCTION public.arrays_equal_unordered(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arrays_equal_unordered(JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.arrays_equal_unordered(JSONB, JSONB) TO anon;

GRANT EXECUTE ON FUNCTION public.normalize_answer(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_answer(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_answer(TEXT) TO anon;

-- Grant permissions on main RPC
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO service_role;


-- ==========================================
-- 2. Quiz Progress RLS (Idempotent)
-- ==========================================

-- Enable RLS
ALTER TABLE public.quiz_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid "already exists" error
DROP POLICY IF EXISTS "Users can delete own progress" ON public.quiz_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.quiz_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.quiz_progress;
DROP POLICY IF EXISTS "Users can select own progress" ON public.quiz_progress;

-- Create policies
CREATE POLICY "Users can delete own progress" 
ON public.quiz_progress FOR DELETE
USING ( auth.uid() = user_id );

CREATE POLICY "Users can insert own progress" 
ON public.quiz_progress FOR INSERT
WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can update own progress" 
ON public.quiz_progress FOR UPDATE
USING ( auth.uid() = user_id );

CREATE POLICY "Users can select own progress" 
ON public.quiz_progress FOR SELECT
USING ( auth.uid() = user_id );
