-- Fix Ambiguous Column Reference Robustly
-- 1. Revert parameter name to user_id to match client expectations
-- 2. Use internal variable to avoid ambiguity in DELETE statements

-- Drop the target_user_id version if it exists
DROP FUNCTION IF EXISTS admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  -- Create a distinct variable to avoid ambiguity with column names
  v_target_id UUID := user_id;
BEGIN
  -- Permission Check
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- 1. Delete related Quiz Results
  DELETE FROM public.quiz_results WHERE quiz_results.user_id = v_target_id;

  -- 2. Delete related System Logs
  DELETE FROM public.system_logs WHERE system_logs.user_id = v_target_id;

  -- 3. Delete Profile
  DELETE FROM public.profiles WHERE profiles.id = v_target_id;

  -- 4. Delete Auth User
  DELETE FROM auth.users WHERE auth.users.id = v_target_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
