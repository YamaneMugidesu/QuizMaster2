-- 01_functions_and_triggers.sql
-- Consolidated Functions and Triggers (as of 2025-12-18)

-- 1. Enable pgcrypto (required for password hashing)
create extension if not exists pgcrypto;

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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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
  -- 1. 权限检查
  SELECT role INTO check_role FROM profiles WHERE id = auth.uid();
  IF check_role IS NULL OR check_role != 'SUPER_ADMIN' THEN
    RETURN jsonb_build_object('success', false, 'message', '无权操作：需要超级管理员权限');
  END IF;

  -- 2. 用户名检查
  SELECT EXISTS(SELECT 1 FROM profiles WHERE username = new_username) INTO user_exists;
  IF user_exists THEN
     RETURN jsonb_build_object('success', false, 'message', '用户名已存在');
  END IF;

  -- 3. 生成邮箱
  new_email := encode(convert_to(new_username, 'UTF8'), 'hex') || '@quizmaster.com';

  -- 清理僵尸账号
  DELETE FROM auth.users WHERE email = new_email;

  -- 获取 instance_id
  SELECT instance_id INTO current_instance_id FROM auth.users WHERE id = auth.uid();
  IF current_instance_id IS NULL THEN
      current_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  new_user_id := gen_random_uuid();

  -- 4. 插入 auth.users
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

  -- 5. 插入 profiles
  INSERT INTO public.profiles (id, username, role, created_at, is_active)
  VALUES (new_user_id, new_username, new_role, extract(epoch from now()) * 1000, true);

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
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

-- Function: Super Admin deletes (soft deletes) a user
CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Check permissions
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
