-- Database Optimization Script
-- Run this in your Supabase SQL Editor to improve performance

-- 1. Optimizing Questions Table
-- These indexes speed up filtering questions by subject, grade, difficulty, and type
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_grade_level ON public.questions(grade_level);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(type);
-- Composite index for common combined filters (e.g. Subject + Grade)
CREATE INDEX IF NOT EXISTS idx_questions_subject_grade ON public.questions(subject, grade_level);

-- 2. Optimizing System Logs Table
-- These indexes speed up the Admin Dashboard's System Monitor
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON public.system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
-- Composite index for filtering by level/category while sorting by time
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created ON public.system_logs(level, created_at DESC);

-- 3. Optimizing Quiz Results Table
-- Speeds up "My Exam Records" and Admin's "User Records"
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_config_id ON public.quiz_results(config_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_timestamp ON public.quiz_results(timestamp DESC);
-- ADDED: Index for searching results by username (used in Admin Dashboard)
CREATE INDEX IF NOT EXISTS idx_quiz_results_username ON public.quiz_results(username);

-- 4. Optimizing Profiles Table
-- Speeds up user lookups and role checks
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 5. Analyze tables to update statistics for the query planner
ANALYZE public.questions;
ANALYZE public.system_logs;
ANALYZE public.quiz_results;
ANALYZE public.profiles;
