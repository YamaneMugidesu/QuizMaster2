-- 00_init_schema.sql
-- Consolidated Schema Definition (as of 2025-12-18)

-- 1. Enable Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- create schema if not exists auth;
-- create table if not exists auth.users (
--   instance_id uuid,
--   id uuid primary key,
--   aud text,
--   role text,
--   email text unique,
--   encrypted_password text,
--   email_confirmed_at timestamptz,
--   created_at timestamptz default now(),
--   updated_at timestamptz default now(),
--   raw_app_meta_data jsonb,
--   raw_user_meta_data jsonb,
--   is_super_admin boolean,
--   is_sso_user boolean,
--   is_anonymous boolean,
--   recovery_token text,
--   email_change text,
--   phone_change text,
--   confirmation_token text,
--   email_change_token_new text,
--   email_change_token_current text,
--   banned_until timestamptz
-- );

-- 2. Create Profiles table (Public User Data)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  role text default 'USER' check (role in ('SUPER_ADMIN', 'ADMIN', 'USER')),
  created_at bigint,
  is_active boolean default true,
  is_deleted boolean default false
);

-- 3. Create Questions table
create table if not exists public.questions (
  id uuid default uuid_generate_v4() primary key,
  type text not null,
  text text not null,
  image_urls jsonb default '[]'::jsonb,
  options jsonb,
  correct_answer text,
  subject text,
  grade_level text,
  difficulty text,
  created_at bigint,
  is_disabled boolean default false,
  score numeric,
  category text default '基础知识',
  content_category text default '默认',
  explanation text,
  is_deleted boolean default false,
  needs_grading boolean default false
);

-- Comment on column
comment on column public.questions.category is 'Question Category: 基础知识, 易错题, 写解析, 标准理解';

-- 4. Create Quiz Configs table
create table if not exists public.quiz_configs (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  passing_score numeric,
  parts jsonb default '[]'::jsonb,
  total_questions integer,
  created_at bigint,
  quiz_mode text default 'practice',
  is_deleted boolean default false,
  is_published boolean default false
);

-- 5. Create Quiz Results table
create table if not exists public.quiz_results (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  username text,
  timestamp bigint,
  score numeric,
  max_score numeric,
  passing_score numeric,
  is_passed boolean,
  total_questions integer,
  attempts jsonb,
  config_id text,
  config_name text,
  duration integer,
  status text default 'completed'
);

-- 6. Create System Logs table
create table if not exists public.system_logs (
  id uuid default uuid_generate_v4() primary key,
  level text not null check (level in ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  category text not null, -- e.g. 'AUTH', 'AI', 'DB', 'SYSTEM', 'USER_ACTION'
  message text not null,
  details jsonb,
  user_id uuid references public.profiles(id),
  created_at bigint not null,
  is_resolved boolean default false
);

-- 7. Create System Settings table
create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_at bigint
);

insert into public.system_settings (key, value, updated_at)
values ('allow_registration', 'true', extract(epoch from now()) * 1000)
on conflict (key) do nothing;

create or replace view public.quiz_results_summary_view 
with (security_invoker = true)
as 
select 
    id, 
    user_id, 
    username, 
    timestamp, 
    score, 
    max_score, 
    passing_score, 
    is_passed, 
    total_questions, 
    config_id, 
    config_name, 
    status, 
    duration, 
    coalesce(
        (
            select jsonb_agg(
                jsonb_build_object(
                    'score', coalesce((elem->>'score')::numeric, 0), 
                    'maxScore', coalesce((elem->>'maxScore')::numeric, 0)
                )
                order by idx
            )
            from jsonb_array_elements(coalesce(attempts, '[]'::jsonb)) with ordinality as t(elem, idx)
        ), 
        '[]'::jsonb
    ) as attempts
from public.quiz_results;

DO $$ BEGIN
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  GRANT SELECT ON public.quiz_results_summary_view TO authenticated;
END IF;
IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
  GRANT SELECT ON public.quiz_results_summary_view TO service_role;
END IF;
END $$;

-- ============================================================
-- 8. Performance Indexes (from optimize_database.sql)
-- ============================================================

-- Questions Table Indexes
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_grade_level ON public.questions(grade_level);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(type);
-- Composite index for common combined filters (e.g. Subject + Grade)
CREATE INDEX IF NOT EXISTS idx_questions_subject_grade ON public.questions(subject, grade_level);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON public.questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_is_deleted_created_at ON public.questions(is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_text_search ON public.questions USING GIN (text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_questions_subject_created_at ON public.questions(subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_type_created_at ON public.questions(type, created_at DESC);

-- System Logs Table Indexes
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON public.system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
-- Composite index for filtering by level/category while sorting by time
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created ON public.system_logs(level, created_at DESC);

-- Quiz Results Table Indexes
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_config_id ON public.quiz_results(config_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_timestamp ON public.quiz_results(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_results_username ON public.quiz_results(username);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_timestamp ON public.quiz_results(user_id, timestamp DESC);

-- Profiles Table Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 9. Analyze tables to update statistics for the query planner
ANALYZE public.questions;
ANALYZE public.system_logs;
ANALYZE public.quiz_results;
ANALYZE public.profiles;
ANALYZE public.system_settings;


-- 01_functions_and_triggers.sql
-- Consolidated Functions and Triggers (as of 2025-12-18)

-- 1. Enable pgcrypto (required for password hashing)
create extension if not exists pgcrypto;
-- DO $$ BEGIN
-- IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
--   EXECUTE 'CREATE SCHEMA auth';
-- END IF;
-- END $$;
-- DO $do$ BEGIN
-- IF NOT EXISTS (
--   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
--   WHERE n.nspname='auth' AND p.proname='uid' AND p.pronargs=0
-- ) THEN
--   EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid STABLE LANGUAGE sql AS $$ SELECT NULL::uuid $$';
-- END IF;
-- END $do$;
-- DO $do$ BEGIN
-- IF NOT EXISTS (
--   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace 
--   WHERE n.nspname='auth' AND p.proname='role' AND p.pronargs=0
-- ) THEN
--   EXECUTE 'CREATE FUNCTION auth.role() RETURNS text STABLE LANGUAGE sql AS $$ SELECT ''authenticated''::text $$';
-- END IF;
-- END $do$;

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


-- 02_rls_policies.sql
-- Consolidated RLS Policies (as of 2025-12-18)
-- Includes performance optimizations (using select auth.uid())

-- 1. Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_configs enable row level security;
alter table public.quiz_results enable row level security;
alter table public.system_logs enable row level security;

-- ============================================================
-- 2. Profiles Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users update own or Super Admin updates all" on public.profiles;
drop policy if exists "Super Admins can delete any profile" on public.profiles;

-- Create Policies
create policy "Public profiles are viewable by everyone" 
on public.profiles for select 
using (true);

create policy "Users can insert their own profile" 
on public.profiles for insert 
with check ( (select auth.uid()) = id );

create policy "Users update own or Super Admin updates all" 
on public.profiles for update
using ( 
  (select auth.uid()) = id 
  OR (select public.is_super_admin()) 
);

create policy "Super Admins can delete any profile" 
on public.profiles for delete
using ( (select public.is_super_admin()) );

-- ============================================================
-- 3. Questions Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Enable read access for all users" on public.questions;
drop policy if exists "Enable insert for authenticated users only" on public.questions;
drop policy if exists "Enable update for authenticated users only" on public.questions;
drop policy if exists "Enable delete for authenticated users only" on public.questions;
drop policy if exists "Admins can insert questions" on public.questions;
drop policy if exists "Admins can update questions" on public.questions;
drop policy if exists "Admins can delete questions" on public.questions;

-- Create Policies
create policy "Enable read access for all users" 
on public.questions for select 
using (true);

create policy "Admins can insert questions" 
on public.questions for insert 
with check ( (select public.is_admin()) );

create policy "Admins can update questions" 
on public.questions for update 
using ( (select public.is_admin()) );

create policy "Admins can delete questions" 
on public.questions for delete 
using ( (select public.is_admin()) );

-- ============================================================
-- 4. Quiz Configs Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Enable all access for configs" on public.quiz_configs;
drop policy if exists "Everyone can view quiz configs" on public.quiz_configs;
drop policy if exists "Admins can insert configs" on public.quiz_configs;
drop policy if exists "Admins can update configs" on public.quiz_configs;
drop policy if exists "Admins can delete configs" on public.quiz_configs;

-- Create Policies
create policy "Everyone can view quiz configs" 
on public.quiz_configs for select 
using ( true );

create policy "Admins can insert configs" 
on public.quiz_configs for insert 
with check ( (select public.is_admin()) );

create policy "Admins can update configs" 
on public.quiz_configs for update 
using ( (select public.is_admin()) );

create policy "Admins can delete configs" 
on public.quiz_configs for delete 
using ( (select public.is_admin()) );

-- ============================================================
-- 5. Quiz Results Policies (Optimized)
-- ============================================================
-- Drop existing policies
drop policy if exists "Enable all access for results" on public.quiz_results;
drop policy if exists "Users view own results, Admins view all" on public.quiz_results;
drop policy if exists "Users can submit own results" on public.quiz_results;
drop policy if exists "Admins can update results" on public.quiz_results;
drop policy if exists "Admins can delete results" on public.quiz_results;

-- Create Policies
create policy "Users view own results, Admins view all" 
on public.quiz_results for select 
using ( 
  (select auth.uid()) = user_id 
  or (select public.is_admin()) 
);

create policy "Users can submit own results" 
on public.quiz_results for insert 
with check ( 
  (select auth.uid()) = user_id 
);

create policy "Admins can update results" 
on public.quiz_results for update 
using ( (select public.is_admin()) );

create policy "Admins can delete results" 
on public.quiz_results for delete 
using ( (select public.is_admin()) );

-- ============================================================
-- 6. System Logs Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Enable insert for authenticated users" on public.system_logs;
drop policy if exists "Enable insert for all users" on public.system_logs;
drop policy if exists "Enable select for super admins only" on public.system_logs;
drop policy if exists "Enable update for super admins only" on public.system_logs;
drop policy if exists "Enable delete for super admins only" on public.system_logs;

-- Create Policies
create policy "Enable insert for all users" on public.system_logs
  for insert with check ( true );

create policy "Enable select for super admins only" on public.system_logs
  for select using ( (select public.is_super_admin()) );

create policy "Enable update for super admins only" on public.system_logs
  for update using ( (select public.is_super_admin()) );

create policy "Enable delete for super admins only" on public.system_logs
  for delete using ( (select public.is_super_admin()) );

-- ============================================================
-- 7. System Settings Policies
-- ============================================================
alter table public.system_settings enable row level security;

-- Drop existing policies
drop policy if exists "Everyone can read system settings" on public.system_settings;
drop policy if exists "Admins can manage system settings" on public.system_settings;
drop policy if exists "Admins can update system settings" on public.system_settings;
drop policy if exists "Admins can insert system settings" on public.system_settings;
drop policy if exists "Admins can delete system settings" on public.system_settings;

-- Create Policies
-- Allow everyone to read settings (e.g. feature flags, global configs)
create policy "Everyone can read system settings" 
on public.system_settings for select 
using ( true );

create policy "Admins can update system settings" 
on public.system_settings for update
using ( (select public.is_admin()) );

create policy "Admins can insert system settings" 
on public.system_settings for insert
with check ( (select public.is_admin()) );

create policy "Admins can delete system settings" 
on public.system_settings for delete
using ( (select public.is_admin()) );


