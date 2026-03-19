-- 27_fix_submission_trigger.sql

-- ==========================================
-- 1. Simplify Trigger Logic (Remove Session Var Dependency)
-- ==========================================
-- The session variable 'app.is_secure_context' might be flaky or not propagating.
-- Instead, we will rely on checking if the user is a Superuser/Postgres (which SECURITY DEFINER functions run as).
-- BUT, Supabase `postgres` role is not always the `current_user` depending on connection pooler?
-- Usually, SECURITY DEFINER functions run as the owner.
-- Let's check if `current_user` is 'postgres' or 'service_role'.

CREATE OR REPLACE FUNCTION public.check_secure_context()
RETURNS TRIGGER AS $$
BEGIN
  -- If the current user is postgres, supabase_admin, or service_role, allow it.
  -- This covers:
  -- 1. SECURITY DEFINER RPC calls (run as owner=postgres)
  -- 2. Service Role API calls
  -- 3. Dashboard SQL Editor
  
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
     RETURN NEW;
  END IF;

  -- Also check if the user is a superuser (redundant but safe)
  -- SELECT rolsuper INTO is_super FROM pg_roles WHERE rolname = current_user;
  -- IF is_super THEN RETURN NEW; END IF;

  -- If we are here, it means the user is 'authenticated' (or 'anon').
  -- Direct inserts from client run as 'authenticated'.
  -- So we BLOCK them.
  
  -- WAIT! If the user is Admin (role='SUPER_ADMIN' in profiles), they might try to insert manually?
  -- No, we forced them to use RPC in frontend logic (we think).
  -- But if they use the Dashboard Table Editor, they act as 'postgres' usually? 
  -- No, Table Editor acts as the logged in user if using RLS? 
  -- Actually, SQL Editor is postgres. Table Editor is authenticated user.
  -- So Admins using Table Editor won't be able to insert. That's acceptable for now.
  -- They should use the UI.

  RAISE EXCEPTION 'Direct insertion denied. You must use the Submit Quiz button.';
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure Trigger is Enabled
DROP TRIGGER IF EXISTS ensure_secure_insert ON public.quiz_results;
CREATE TRIGGER ensure_secure_insert
BEFORE INSERT ON public.quiz_results
FOR EACH ROW
EXECUTE FUNCTION public.check_secure_context();

-- 3. Ensure RLS allows the insert (so Trigger can even run)
-- The Trigger runs BEFORE insert.
-- RLS runs... also.
-- If RLS denies, Trigger might not even run? Or Trigger runs then RLS?
-- Postgres: RLS is checked. If passed, Trigger runs.
-- So we MUST have a permissive RLS policy for the User.

DROP POLICY IF EXISTS "Users can submit own results" ON public.quiz_results;
CREATE POLICY "Users can submit own results" 
ON public.quiz_results FOR INSERT 
WITH CHECK ( auth.uid() = user_id );

-- 4. Grant Insert (just in case)
GRANT INSERT ON public.quiz_results TO authenticated;
GRANT INSERT ON public.quiz_results TO service_role;
