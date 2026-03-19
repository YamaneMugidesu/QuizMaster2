-- Fix Delete User Foreign Key Constraint
-- This script updates admin_delete_user to manually delete related records
-- in quiz_results and system_logs before deleting the user.

DROP FUNCTION IF EXISTS admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Permission Check
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- 1. Delete related Quiz Results (Fixes foreign key constraint error)
  DELETE FROM public.quiz_results WHERE user_id = user_id;

  -- 2. Delete related System Logs (To be safe)
  DELETE FROM public.system_logs WHERE user_id = user_id;

  -- 3. Delete Profile (Explicitly)
  DELETE FROM public.profiles WHERE id = user_id;

  -- 4. Delete Auth User (Hard Delete)
  DELETE FROM auth.users WHERE id = user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
