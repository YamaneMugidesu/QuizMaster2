-- Performance Optimization Migration Script
-- Run this script in the Supabase SQL Editor to fix RLS performance warnings

-- ============================================================
-- 1. Optimized Quiz Results Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Users view own results, Admins view all" on public.quiz_results;
drop policy if exists "Users can submit own results" on public.quiz_results;

-- Optimized Read Policy: Use (select auth.uid()) to prevent re-evaluation for every row
create policy "Users view own results, Admins view all" 
on public.quiz_results for select 
using ( 
  (select auth.uid()) = user_id 
  or public.is_admin() 
);

-- Optimized Insert Policy
create policy "Users can submit own results" 
on public.quiz_results for insert 
with check ( 
  (select auth.uid()) = user_id 
);
