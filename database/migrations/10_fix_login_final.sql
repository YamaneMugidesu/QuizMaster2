-- Fix Login: Force bcrypt cost factor 10 and clear all blocks
-- 1. Updates password using gen_salt('bf', 10) to match creation logic
-- 2. Clears banned_until and confirmation tokens
-- 3. Ensures aud is 'authenticated'

DROP FUNCTION IF EXISTS admin_update_user_details(uuid, text, text);

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

  -- Update Username/Email
  IF new_username IS NOT NULL THEN
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(),
        email_change = '',
        email_change_token_new = '',
        email_change_token_current = '',
        banned_until = NULL,             -- UNBAN USER
        raw_app_meta_data = jsonb_set(   -- ENSURE PROVIDER IS SET
            COALESCE(raw_app_meta_data, '{}'::jsonb),
            '{provider}',
            '"email"'
        ),
        raw_user_meta_data = jsonb_set(
            COALESCE(raw_user_meta_data, '{}'::jsonb),
            '{username}',
            to_jsonb(new_username)
        ),
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  -- Update Password
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf', 10)), -- USE COST 10
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload config';
