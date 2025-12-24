-- UNIFIED FIX for Login and Delete
-- 1. Drops old functions to clear schema cache issues
-- 2. Recreates functions with 'user_id' parameter to match client
-- 3. Ensures email verification and token clearing for login

-- === DROP OLD VERSIONS ===
DROP FUNCTION IF EXISTS admin_update_user_details(uuid, text, text);
DROP FUNCTION IF EXISTS admin_delete_user(uuid);

-- === RECREATE ADMIN_UPDATE_USER_DETAILS ===
CREATE OR REPLACE FUNCTION admin_update_user_details(
  user_id UUID,
  new_username TEXT DEFAULT NULL,
  new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_id UUID := user_id;
  new_email TEXT;
  check_role TEXT;
BEGIN
  -- Permission Check
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- Handle Username/Email Update
  IF new_username IS NOT NULL THEN
    -- Generate Safe Email (Hex Encoded)
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(),   -- FORCE VERIFIED
        email_change = '',            -- CLEAR PENDING CHANGE
        email_change_token_new = '',  -- CLEAR TOKENS
        email_change_token_current = '',
        raw_user_meta_data = jsonb_set(
            COALESCE(raw_user_meta_data, '{}'::jsonb),
            '{username}',
            to_jsonb(new_username)
        ),
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  -- Handle Password Update
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- === RECREATE ADMIN_DELETE_USER ===
CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_id UUID := user_id;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  DELETE FROM public.quiz_results WHERE quiz_results.user_id = v_target_id;
  DELETE FROM public.system_logs WHERE system_logs.user_id = v_target_id;
  DELETE FROM public.profiles WHERE profiles.id = v_target_id;
  DELETE FROM auth.users WHERE auth.users.id = v_target_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Force reload
NOTIFY pgrst, 'reload config';
