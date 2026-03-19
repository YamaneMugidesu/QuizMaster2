-- 00_init_schema.sql
-- Consolidated Schema Definition (as of 2025-12-18)

-- 1. Enable Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

create schema if not exists auth;
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  is_sso_user boolean,
  is_anonymous boolean,
  recovery_token text,
  email_change text,
  phone_change text,
  confirmation_token text,
  email_change_token_new text,
  email_change_token_current text,
  banned_until timestamptz
);

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
