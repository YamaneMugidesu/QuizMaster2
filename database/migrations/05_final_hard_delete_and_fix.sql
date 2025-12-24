-- Final Fix for User Management
-- 1. Hard Delete for cleaner removal
-- 2. Robust Login Fix (Clear email change tokens)

-- FIX 1: Hard Delete User (Removes from auth.users and profiles)
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

  -- HARD DELETE: Remove from auth.users
  -- This will cascade to public.profiles if foreign keys are set up, 
  -- but we can delete from profiles first just in case.
  DELETE FROM public.profiles WHERE id = user_id;
  DELETE FROM auth.users WHERE id = user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- FIX 2: Robust Update (Prevent Email Confirmation Lockout)
DROP FUNCTION IF EXISTS admin_update_user_details(uuid, text, text);

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
  -- Permission Check
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- Handle Username/Email Update
  IF new_username IS NOT NULL THEN
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(), -- Force verified
        email_change = '',          -- Clear pending change
        email_change_token_new = '', -- Clear token
        email_change_token_current = '', -- Clear token
        raw_user_meta_data = jsonb_set(
            COALESCE(raw_user_meta_data, '{}'::jsonb),
            '{username}',
            to_jsonb(new_username)
        ),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  -- Handle Password Update
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

-- Force reload
NOTIFY pgrst, 'reload config';
