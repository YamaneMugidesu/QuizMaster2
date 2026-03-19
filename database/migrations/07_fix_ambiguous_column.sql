-- Fix Ambiguous Column Reference in Delete User
-- Renames the function parameter to target_user_id to avoid conflict with table column user_id.

DROP FUNCTION IF EXISTS admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
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

  -- 1. Delete related Quiz Results (Use target_user_id to avoid ambiguity)
  DELETE FROM public.quiz_results WHERE user_id = target_user_id;

  -- 2. Delete related System Logs
  DELETE FROM public.system_logs WHERE user_id = target_user_id;

  -- 3. Delete Profile
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 4. Delete Auth User
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
