-- Create system_logs table for audit and monitoring
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

-- Enable RLS
alter table public.system_logs enable row level security;

-- Policies

-- 1. Insert: Allow authenticated users to insert logs (e.g. client-side errors, audit trails)
-- Optimized with (select ...) for Supabase performance
create policy "Enable insert for authenticated users" on public.system_logs
  for insert with check ( (select auth.role()) = 'authenticated' );

-- 2. Select: Only SUPER_ADMIN can view logs
create policy "Enable select for super admins only" on public.system_logs
  for select using ( (select public.is_super_admin()) );

-- 3. Update: Only SUPER_ADMIN can update logs (e.g. mark as resolved)
create policy "Enable update for super admins only" on public.system_logs
  for update using ( (select public.is_super_admin()) );

-- 4. Delete: Only SUPER_ADMIN can delete logs (cleanup)
create policy "Enable delete for super admins only" on public.system_logs
  for delete using ( (select public.is_super_admin()) );
