-- 20_fix_view_permissions.sql

-- ==========================================
-- 1. Restore Table Visibility (for View to work)
-- ==========================================
-- The previous migration restricted table access to Admins only.
-- This caused the View (running as the User) to return 0 rows because of RLS.
-- We must allow Users to "see" the rows in the table via RLS, 
-- but we will REVOKE the SELECT privilege on the table to prevent direct access.

-- 1.1 Drop the restrictive Admin-only policy
DROP POLICY IF EXISTS "Allow admins to read all questions" ON public.questions;

-- 1.2 Re-create the Permissive Policy (Row Visibility)
-- This allows RLS to pass for everyone, so the View can see the rows.
CREATE POLICY "Enable read access for all users" 
ON public.questions FOR SELECT 
USING ( true );

-- ==========================================
-- 2. Restrict Direct Table Access (Column Security)
-- ==========================================
-- Now that RLS allows seeing rows, we must prevent Users from querying the table directly
-- to see hidden columns (like correct_answer).

-- 2.1 Revoke generic SELECT from authenticated users
REVOKE SELECT ON public.questions FROM authenticated;
REVOKE SELECT ON public.questions FROM anon;

-- 2.2 Grant SELECT on SAFE columns only to authenticated users (and anon)
-- This allows Users to query these specific columns directly if needed,
-- and allows the View (which selects these columns) to work.
GRANT SELECT (
  id, 
  type, 
  text, 
  image_urls, 
  options, 
  subject, 
  grade_level, 
  difficulty, 
  category, 
  content_category, 
  created_at, 
  is_disabled, 
  score, 
  needs_grading,
  is_deleted
) ON public.questions TO authenticated;

GRANT SELECT (
  id, 
  type, 
  text, 
  image_urls, 
  options, 
  subject, 
  grade_level, 
  difficulty, 
  category, 
  content_category, 
  created_at, 
  is_disabled, 
  score, 
  needs_grading,
  is_deleted
) ON public.questions TO anon;

-- ==========================================
-- 3. Ensure View Access
-- ==========================================
-- Grant full SELECT on the view (which only contains safe columns)
GRANT SELECT ON public.questions_safe_view TO authenticated;
GRANT SELECT ON public.questions_safe_view TO anon;

-- ==========================================
-- 4. Admin Access Fix
-- ==========================================
-- Admins are also "authenticated", so they lost access to "correct_answer" via the table.
-- We need a way for Admins to see everything.
-- Since we cannot easily distinguish Roles in Grant, we create a Secure Function for Admins.

CREATE OR REPLACE FUNCTION public.admin_get_question_details(p_id UUID)
RETURNS SETOF public.questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check Admin Permission
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY SELECT * FROM public.questions WHERE id = p_id;
END;
$$;

-- Grant Execute to authenticated (checked inside)
GRANT EXECUTE ON FUNCTION public.admin_get_question_details(UUID) TO authenticated;
