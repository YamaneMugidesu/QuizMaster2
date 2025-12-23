-- Security Hardening Migration Script
-- Run this script in the Supabase SQL Editor to fix RLS permissions

-- 1. Helper function to check if user is ADMIN or SUPER_ADMIN
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

-- ============================================================
-- 2. Secure Questions Table
-- ============================================================
-- Drop loose policies
drop policy if exists "Enable insert for authenticated users only" on public.questions;
drop policy if exists "Enable update for authenticated users only" on public.questions;
drop policy if exists "Enable delete for authenticated users only" on public.questions;

-- Create strict policies
create policy "Admins can insert questions" 
on public.questions for insert 
with check ( public.is_admin() );

create policy "Admins can update questions" 
on public.questions for update 
using ( public.is_admin() );

create policy "Admins can delete questions" 
on public.questions for delete 
using ( public.is_admin() );

-- Note: "Enable read access for all users" policy is kept as is (allows public read).

-- ============================================================
-- 3. Secure Quiz Configs Table
-- ============================================================
drop policy if exists "Enable all access for configs" on public.quiz_configs;

-- Read: Everyone (allows users to see available quizzes)
create policy "Everyone can view quiz configs" 
on public.quiz_configs for select 
using ( true );

-- Write: Admins only
create policy "Admins can insert configs" 
on public.quiz_configs for insert 
with check ( public.is_admin() );

create policy "Admins can update configs" 
on public.quiz_configs for update 
using ( public.is_admin() );

create policy "Admins can delete configs" 
on public.quiz_configs for delete 
using ( public.is_admin() );

-- ============================================================
-- 4. Secure Quiz Results Table
-- ============================================================
drop policy if exists "Enable all access for results" on public.quiz_results;

-- Read: Users see own, Admins see all
create policy "Users view own results, Admins view all" 
on public.quiz_results for select 
using ( 
  auth.uid() = user_id 
  or public.is_admin() 
);

-- Insert: Users can submit their own results
create policy "Users can submit own results" 
on public.quiz_results for insert 
with check ( 
  auth.uid() = user_id 
);

-- Update/Delete: Admins only
create policy "Admins can update results" 
on public.quiz_results for update 
using ( public.is_admin() );

create policy "Admins can delete results" 
on public.quiz_results for delete 
using ( public.is_admin() );
