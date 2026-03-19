-- Enable RLS (already enabled, but good to ensure)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1. Allow Super Admins to DELETE any user profile
-- Note: This requires the current user to have 'SUPER_ADMIN' role in their profile
CREATE POLICY "Super Admins can delete any profile"
ON public.profiles
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- 2. Allow Super Admins to UPDATE any user profile (e.g. changing roles)
CREATE POLICY "Super Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  )
);

-- Note: The existing "Users can update own profile" policy still applies for normal users.
-- Supabase policies are "OR" (permissive). If any policy allows it, it's allowed.
