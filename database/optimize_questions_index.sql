-- Optimize Questions Table Performance
-- Run this script in Supabase SQL Editor

-- 1. Add index on created_at for faster sorting (default sort order)
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON public.questions(created_at DESC);

-- 2. Add composite index for is_deleted + created_at
-- This optimizes the default view where we show non-deleted questions sorted by time
CREATE INDEX IF NOT EXISTS idx_questions_is_deleted_created_at ON public.questions(is_deleted, created_at DESC);

-- 3. Enable pg_trgm extension for faster text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Add GIN index for text search (speeds up 'ilike' queries)
CREATE INDEX IF NOT EXISTS idx_questions_text_search ON public.questions USING GIN (text gin_trgm_ops);

-- 5. Add composite indexes for common filter combinations + sort
-- Optimizes "Subject + Sort"
CREATE INDEX IF NOT EXISTS idx_questions_subject_created_at ON public.questions(subject, created_at DESC);

-- Optimizes "Type + Sort"
CREATE INDEX IF NOT EXISTS idx_questions_type_created_at ON public.questions(type, created_at DESC);

-- 6. Update statistics
ANALYZE public.questions;
