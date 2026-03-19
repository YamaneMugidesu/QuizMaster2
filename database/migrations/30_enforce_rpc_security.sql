-- 30_enforce_rpc_security.sql

-- ==========================================
-- 1. Lock Down Table Access (Application Layer Security)
-- ==========================================
-- We are moving the "Application Layer" validation into the Database RPC.
-- To do this, we MUST ensure that NO ONE except the RPC (running as Superuser/Postgres)
-- can insert into the quiz_results table.

-- Revoke INSERT from everyone (authenticated, anon)
REVOKE INSERT ON public.quiz_results FROM authenticated;
REVOKE INSERT ON public.quiz_results FROM anon;
REVOKE INSERT ON public.quiz_results FROM public;

-- Ensure Service Role still has access (for Dashboard/Admin API if needed)
GRANT INSERT ON public.quiz_results TO service_role;

-- Ensure Postgres role has access (for RPC)
GRANT INSERT ON public.quiz_results TO postgres;

-- ==========================================
-- 2. Enforce RPC Ownership (Critical)
-- ==========================================
-- The RPC `submit_quiz` MUST run as `postgres` (Superuser) to bypass the RLS/Permission check
-- that we just imposed on regular users.
-- SECURITY DEFINER functions run with the privileges of the owner.

ALTER FUNCTION public.submit_quiz(UUID, JSONB, INT) OWNER TO postgres;

-- ==========================================
-- 3. Cleanup Policies
-- ==========================================
-- Since we revoked INSERT permission, the RLS policy for INSERT is now redundant/useless for users.
-- We can drop it to avoid confusion.
-- The RPC (as postgres) bypasses RLS anyway.

DROP POLICY IF EXISTS "Users can submit own results" ON public.quiz_results;

-- Create a "Deny All" policy for INSERT just to be explicit (optional, since REVOKE handles it)
-- CREATE POLICY "Deny insert for users" ON public.quiz_results FOR INSERT WITH CHECK (false);
