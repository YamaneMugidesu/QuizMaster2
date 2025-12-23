-- Fix RLS policy for system_logs to allow anonymous users (login page) to write logs
-- This is necessary to capture "Login Failed" events which happen before authentication

drop policy if exists "Enable insert for authenticated users" on public.system_logs;

create policy "Enable insert for all users" on public.system_logs
  for insert with check ( true );
