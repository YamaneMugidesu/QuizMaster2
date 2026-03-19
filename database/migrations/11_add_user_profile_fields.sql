
-- Add new fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS provider_name text,
ADD COLUMN IF NOT EXISTS school_stage text[],
ADD COLUMN IF NOT EXISTS subject text[];

comment on column public.profiles.provider_name is '供应商名称';
comment on column public.profiles.school_stage is '学段 (小学, 初中, 高中)';
comment on column public.profiles.subject is '学科 (语文, 数学, 英语, ...)';
