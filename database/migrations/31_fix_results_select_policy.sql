-- 31_fix_results_select_policy.sql

-- ==========================================
-- 1. Fix Quiz Results Visibility for Admins
-- ==========================================
-- Currently, we might have restricted SELECT on quiz_results too much,
-- or the default RLS policy only allows users to see their OWN results.
-- Admins need to see ALL results.

-- Check existing policies (we can't see them, so we recreate).
DROP POLICY IF EXISTS "Users can view own results" ON public.quiz_results;
DROP POLICY IF EXISTS "Admins can view all results" ON public.quiz_results;

-- Policy 1: Users see their own
CREATE POLICY "Users can view own results" 
ON public.quiz_results FOR SELECT 
USING ( auth.uid() = user_id );

-- Policy 2: Admins see all
-- We use the `public.is_admin()` helper function we created earlier.
CREATE POLICY "Admins can view all results" 
ON public.quiz_results FOR SELECT 
USING ( public.is_admin() );

-- ==========================================
-- 2. Fix Quiz Results Summary View (If used)
-- ==========================================
-- If the frontend uses `quiz_results_summary_view`, it inherits RLS from `quiz_results`
-- because it was created with `security_invoker = true`.
-- So fixing the table policies above should automatically fix the view for Admins.

-- Just in case, ensure Grant Select is correct
GRANT SELECT ON public.quiz_results TO authenticated;
GRANT SELECT ON public.quiz_results TO service_role;
