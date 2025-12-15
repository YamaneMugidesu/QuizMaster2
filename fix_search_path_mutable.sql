-- Fix for "Function Search Path Mutable" security warning
-- This explicitly sets the search_path for the security definer function.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
