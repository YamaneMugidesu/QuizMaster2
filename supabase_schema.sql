-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Create Profiles table (Public User Data)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  role text default 'USER' check (role in ('SUPER_ADMIN', 'ADMIN', 'USER')),
  created_at bigint
);

-- 3. Create Questions table
create table public.questions (
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
  score numeric
);

-- 4. Create Quiz Configs table
create table public.quiz_configs (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  passing_score numeric,
  parts jsonb default '[]'::jsonb,
  total_questions integer,
  created_at bigint
);

-- 5. Create Quiz Results table
create table public.quiz_results (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  username text,
  timestamp bigint,
  score numeric,
  max_score numeric,
  passing_score numeric,
  is_passed boolean,
  total_questions integer,
  attempts jsonb,
  config_id text,
  config_name text
);

-- 6. Enable RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_configs enable row level security;
alter table public.quiz_results enable row level security;

-- Policies
-- Profiles: Everyone can view, Users can insert/update their own
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Questions: Authenticated users can view, only specific roles should edit (simplified to auth users for now or implement role check)
create policy "Enable read access for all users" on public.questions for select using (true);
create policy "Enable insert for authenticated users only" on public.questions for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users only" on public.questions for update using (auth.role() = 'authenticated');
create policy "Enable delete for authenticated users only" on public.questions for delete using (auth.role() = 'authenticated');

-- Configs: Public read
create policy "Enable all access for configs" on public.quiz_configs for all using (true);

-- Results: Public read (or restrict to own)
create policy "Enable all access for results" on public.quiz_results for all using (true);

-- 7. Trigger for new user creation
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, username, role, created_at)
  values (new.id, new.raw_user_meta_data->>'username', 'USER', extract(epoch from now()) * 1000);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. System Settings Table
create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_at bigint
);

alter table public.system_settings enable row level security;

-- Allow read access for everyone (so login page can check if registration is allowed)
create policy "Read access for all" on public.system_settings for select using (true);

-- Allow write access only for admins (SUPER_ADMIN and ADMIN)
create policy "Write access for admins" on public.system_settings for all using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('SUPER_ADMIN', 'ADMIN')
  )
);

-- Insert default value for registration (enabled by default)
insert into public.system_settings (key, value, updated_at)
values ('allow_registration', 'true', extract(epoch from now()) * 1000)
on conflict (key) do nothing;
