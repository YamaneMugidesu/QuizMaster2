-- Fix Login Issue (Email Confirmation) and Optimize Updates
-- Run this script to ensure modifying username keeps the account usable.

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
  -- 1. Permission Check
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- 2. Construct Dynamic Update
  -- We use a single UPDATE statement for atomicity if possible, but conditional logic makes it tricky.
  -- We'll handle email and password updates sequentially but within the same transaction.

  -- Handle Username/Email Update
  IF new_username IS NOT NULL THEN
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(), -- CRITICAL: Ensure email change doesn't unverify user
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

-- Force schema cache reload
NOTIFY pgrst, 'reload config';
