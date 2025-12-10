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
  -- 改进：
  -- 1. 显式设置 is_anonymous = false
  -- 2. 显式设置所有 token 字段为空字符串（匹配 Admin 账号结构）
  -- 3. 指定 password hash cost 为 10
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
    crypt(new_password, gen_salt('bf', 10)), -- 指定 cost 为 10
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
    false, -- is_anonymous
    '', -- recovery_token
    '', -- email_change
    '', -- phone_change
    '', -- confirmation_token
    '', -- email_change_token_new
    ''  -- email_change_token_current
  );

  -- 5. 插入 profiles
  INSERT INTO public.profiles (
    id, username, role, created_at, is_deleted, is_active
  ) VALUES (
    new_user_id, new_username, new_role, extract(epoch from now()) * 1000, false, true
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username, role = EXCLUDED.role, is_deleted = EXCLUDED.is_deleted, is_active = EXCLUDED.is_active;

  RETURN jsonb_build_object('success', true, 'userId', new_user_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', '数据库错误: ' || SQLERRM);
END;
$$;
