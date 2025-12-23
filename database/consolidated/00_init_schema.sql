-- 00_init_schema.sql
-- Consolidated Schema Definition (as of 2025-12-18)

-- 1. Enable Extensions
create extension if not exists "uuid-ossp";

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

-- Profiles Table Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 9. Analyze tables to update statistics for the query planner
ANALYZE public.questions;
ANALYZE public.system_logs;
ANALYZE public.quiz_results;
ANALYZE public.profiles;
ANALYZE public.system_settings;
