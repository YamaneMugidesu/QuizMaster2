-- Function: Super Admin updates user details (username/email and password)
-- This fixes the issue where updating username in profiles table didn't sync to auth.users email,
-- causing login failures because login relies on generated email from username.

CREATE OR REPLACE FUNCTION admin_update_user_details(
  target_user_id UUID,
  new_username TEXT DEFAULT NULL,
  new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_email TEXT;
  check_role TEXT;
BEGIN
  -- 1. Check Permissions
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- 2. Handle Username Update (Email Update)
  IF new_username IS NOT NULL THEN
    -- Generate new email (Hex encoding to support Chinese characters, matching login logic)
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    -- Update auth.users email and metadata
    UPDATE auth.users
    SET email = new_email,
        raw_user_meta_data = jsonb_set(
            COALESCE(raw_user_meta_data, '{}'::jsonb),
            '{username}',
            to_jsonb(new_username)
        ),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  -- 3. Handle Password Update
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
