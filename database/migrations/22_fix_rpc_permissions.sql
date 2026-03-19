-- 22_fix_rpc_permissions.sql

-- ==========================================
-- 1. Grant Execute Permission on Submit Quiz RPC
-- ==========================================
-- This is critical for users to submit quizzes.
-- Without this, they will receive a "403 Permission Denied" error or "Function not found".

GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(UUID, JSONB, INT) TO service_role;

-- Also grant execute on helper functions just in case (though usually not needed if called internally)
GRANT EXECUTE ON FUNCTION public.normalize_answer(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_answer(TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.arrays_equal_unordered(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arrays_equal_unordered(JSONB, JSONB) TO service_role;

-- ==========================================
-- 2. Verify Function Search Path (Best Practice)
-- ==========================================
-- Ensure search_path is set correctly to avoid hijacking
ALTER FUNCTION public.submit_quiz(UUID, JSONB, INT) SET search_path = public;
