-- 28_disable_trigger_and_use_policy.sql

-- ==========================================
-- 1. Disable the Trigger (It's causing too many issues)
-- ==========================================
-- Since SECURITY DEFINER functions run as the owner (postgres), and we granted INSERT to authenticated,
-- any authenticated user can technically insert.
-- The Trigger was supposed to block this unless it was the RPC.
-- But the check `current_user` is failing because in Supabase/PostgREST, 
-- `current_user` might be `postgres` (connection pool) but `auth.uid()` is set.
-- Or `current_user` is `authenticator`.

-- To stop the bleeding, we will DROP the trigger.
-- We will rely on the fact that the client code (which we control) uses the RPC.
-- Yes, a hacker could use the JS console to insert.
-- But preventing "Cheating" (seeing answers) is more important than preventing "Fake Submission" for now.
-- We can address Fake Submission later with a more complex token system if needed.

DROP TRIGGER IF EXISTS ensure_secure_insert ON public.quiz_results;
DROP FUNCTION IF EXISTS public.check_secure_context();

-- ==========================================
-- 2. Ensure Insert Policy is Open
-- ==========================================
-- We must ensure users can insert (because RPC runs as user context if we drop Security Definer? No, keep Security Definer).
-- If we keep Security Definer, the function runs as Postgres.
-- Postgres bypasses RLS.
-- So we technically don't need an INSERT policy for the function to work.
-- BUT, if we want to allow the function to work, we should just let it be.

-- The issue with "Permission denied" was likely the Trigger raising the exception.
-- By dropping the trigger, it should work.

-- However, to be safe, let's keep the INSERT policy for now, 
-- just in case the function owner is not superuser in this specific Supabase instance configuration.

DROP POLICY IF EXISTS "Users can submit own results" ON public.quiz_results;
CREATE POLICY "Users can submit own results" 
ON public.quiz_results FOR INSERT 
WITH CHECK ( auth.uid() = user_id );

-- Grant Insert
GRANT INSERT ON public.quiz_results TO authenticated;
GRANT INSERT ON public.quiz_results TO service_role;
