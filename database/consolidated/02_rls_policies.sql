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
  OR public.is_super_admin() 
);

create policy "Super Admins can delete any profile" 
on public.profiles for delete
using ( public.is_super_admin() );

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
with check ( public.is_admin() );

create policy "Admins can update questions" 
on public.questions for update 
using ( public.is_admin() );

create policy "Admins can delete questions" 
on public.questions for delete 
using ( public.is_admin() );

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
with check ( public.is_admin() );

create policy "Admins can update configs" 
on public.quiz_configs for update 
using ( public.is_admin() );

create policy "Admins can delete configs" 
on public.quiz_configs for delete 
using ( public.is_admin() );

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
  or public.is_admin() 
);

create policy "Users can submit own results" 
on public.quiz_results for insert 
with check ( 
  (select auth.uid()) = user_id 
);

create policy "Admins can update results" 
on public.quiz_results for update 
using ( public.is_admin() );

create policy "Admins can delete results" 
on public.quiz_results for delete 
using ( public.is_admin() );

-- ============================================================
-- 6. System Logs Policies
-- ============================================================
-- Drop existing policies
drop policy if exists "Enable insert for authenticated users" on public.system_logs;
drop policy if exists "Enable select for super admins only" on public.system_logs;
drop policy if exists "Enable update for super admins only" on public.system_logs;
drop policy if exists "Enable delete for super admins only" on public.system_logs;

-- Create Policies
create policy "Enable insert for authenticated users" on public.system_logs
  for insert with check ( (select auth.role()) = 'authenticated' );

create policy "Enable select for super admins only" on public.system_logs
  for select using ( public.is_super_admin() );

create policy "Enable update for super admins only" on public.system_logs
  for update using ( public.is_super_admin() );

create policy "Enable delete for super admins only" on public.system_logs
  for delete using ( public.is_super_admin() );

-- ============================================================
-- 7. System Settings Policies
-- ============================================================
alter table public.system_settings enable row level security;

-- Drop existing policies
drop policy if exists "Everyone can read system settings" on public.system_settings;
drop policy if exists "Admins can manage system settings" on public.system_settings;

-- Create Policies
-- Allow everyone to read settings (e.g. feature flags, global configs)
create policy "Everyone can read system settings" 
on public.system_settings for select 
using ( true );

-- Only Admins can insert/update/delete settings
create policy "Admins can manage system settings" 
on public.system_settings for all
using ( public.is_admin() );
