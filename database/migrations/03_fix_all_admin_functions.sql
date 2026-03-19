-- Fix Admin Functions (Delete & Update)
-- Run this script in Supabase SQL Editor to fix "function not found" errors and login issues.

-- 1. Fix admin_delete_user (Fixes the delete error)
DROP FUNCTION IF EXISTS admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Check permission
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- Soft delete profile
  UPDATE public.profiles
  SET is_deleted = true,
      is_active = false
  WHERE id = user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 2. Fix admin_update_user_details (Fixes the login issue after username change)
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
  -- Check permission
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- Handle Username Update (Syncs with auth.users email)
  IF new_username IS NOT NULL THEN
    -- Generate new email (Hex encoding to support Chinese characters)
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    -- Update auth.users
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

-- 3. Reload Schema Cache (Fixes "schema cache" errors)
NOTIFY pgrst, 'reload config';
