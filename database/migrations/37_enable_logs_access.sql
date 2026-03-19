-- 37_enable_logs_access.sql

-- ==========================================
-- Fix System Logs Access for Debugging
-- ==========================================

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own logs (Critical for the Debug Info panel)
DROP POLICY IF EXISTS "Users can see own logs" ON public.system_logs;
CREATE POLICY "Users can see own logs" ON public.system_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow Service Role full access
DROP POLICY IF EXISTS "Service role full access on logs" ON public.system_logs;
CREATE POLICY "Service role full access on logs" ON public.system_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant Select permission
GRANT SELECT ON public.system_logs TO authenticated;
