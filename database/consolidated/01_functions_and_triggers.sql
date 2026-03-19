-- 01_functions_and_triggers.sql
-- Consolidated Functions and Triggers (as of 2025-12-18)

-- 1. Enable pgcrypto (required for password hashing)
create extension if not exists pgcrypto;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
  EXECUTE 'CREATE SCHEMA auth';
END IF;
END $$;
DO $do$ BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
  WHERE n.nspname='auth' AND p.proname='uid' AND p.pronargs=0
) THEN
  EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid STABLE LANGUAGE sql AS $$ SELECT NULL::uuid $$';
END IF;
END $do$;
DO $do$ BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
  WHERE n.nspname='auth' AND p.proname='role' AND p.pronargs=0
) THEN
  EXECUTE 'CREATE FUNCTION auth.role() RETURNS text STABLE LANGUAGE sql AS $$ SELECT ''authenticated''::text $$';
END IF;
END $do$;

-- 2. Helper Functions for Role Checking
create or replace function public.is_super_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'SUPER_ADMIN'
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() 
    and role in ('ADMIN', 'SUPER_ADMIN')
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- 3. Trigger for new user creation (Auto-create profile)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, username, role, created_at)
  values (new.id, new.raw_user_meta_data->>'username', 'USER', extract(epoch from now()) * 1000);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Drop trigger if exists to avoid duplication error
DO $$ BEGIN
IF EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace 
  WHERE n.nspname='auth' AND c.relname='users'
) THEN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t 
    WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname = 'on_auth_user_created'
  ) THEN
    EXECUTE 'DROP TRIGGER on_auth_user_created ON auth.users';
  END IF;
  EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user()';
END IF;
END $$;

-- 4. Admin Management Functions

-- Function: Super Admin creates a new user
CREATE OR REPLACE FUNCTION admin_create_user(
  new_username TEXT,
  new_password TEXT,
  new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id UUID;
  new_email TEXT;
  check_role TEXT;
  user_exists BOOLEAN;
  current_instance_id UUID;
BEGIN
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE username = new_username) INTO user_exists;
  IF user_exists THEN
     RETURN jsonb_build_object('success', false, 'message', '用户名已存在');
  END IF;

  new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';

  DELETE FROM auth.users WHERE email = new_email;

  SELECT instance_id INTO current_instance_id FROM auth.users WHERE id = auth.uid();
  IF current_instance_id IS NULL THEN
      current_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous,
    recovery_token,
    email_change,
    phone_change,
    confirmation_token,
    email_change_token_new,
    email_change_token_current
  ) VALUES (
    current_instance_id,
    new_user_id,
    'authenticated',
    'authenticated',
    new_email,
    crypt(new_password, gen_salt('bf', 10)),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'sub', new_user_id,
      'role', new_role,
      'email', new_email,
      'username', new_username,
      'email_verified', true,
      'phone_verified', false
    ),
    NULL,
    false,
    false,
    '',
    '',
    '',
    '',
    '',
    ''
  );

  INSERT INTO public.profiles (
    id, username, role, created_at, is_deleted, is_active
  ) VALUES (
    new_user_id, new_username, new_role, extract(epoch from now()) * 1000, false, true
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, role = EXCLUDED.role, is_deleted = EXCLUDED.is_deleted, is_active = EXCLUDED.is_active;

  RETURN jsonb_build_object('success', true, 'userId', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Function: Super Admin updates user password
CREATE OR REPLACE FUNCTION admin_update_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Check if the executing user is a SUPER_ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only Super Admins can reset passwords';
  END IF;

  -- Update the password in auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

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
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  IF new_username IS NOT NULL THEN
    new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';
    
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(),
        email_change = '',
        email_change_token_new = '',
        email_change_token_current = '',
        banned_until = NULL,
        raw_app_meta_data = jsonb_set(
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

  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = v_target_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  DELETE FROM public.quiz_results WHERE quiz_results.user_id = user_id;
  DELETE FROM public.system_logs WHERE system_logs.user_id = user_id;
  DELETE FROM public.profiles WHERE profiles.id = user_id;
  DELETE FROM auth.users WHERE auth.users.id = user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
