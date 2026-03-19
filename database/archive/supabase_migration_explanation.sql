-- Add explanation column to questions table
ALTER TABLE public.questions ADD COLUMN explanation text;

-- No update to RLS policies is needed as existing policies cover "all columns" implicitly for select/insert/update/delete
-- (e.g. "using (true)" or "with check (auth.role() = ...)")
