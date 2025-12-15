-- 进一步优化 RLS 策略 (Round 2)

-- 1. 优化 profiles 表的 INSERT 策略 (解决 "re-evaluates current_setting" 警告)
-- Supabase 建议将 `auth.uid()` 包装在 `(select auth.uid())` 中以确保它只被评估一次
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  (select auth.uid()) = id
);

-- 2. 优化 system_settings 表的 SELECT 策略 (解决 "Multiple Permissive Policies" 警告)
-- 问题原因：`Write access for admins` 是 `FOR ALL`，它包含了 `SELECT`。
-- 同时还有 `Read access for all` 也是 `FOR SELECT`。
-- 这导致 admins 在 select 时会触发两个策略。

-- 解决方案：将 `Write access for admins` 拆分为 `INSERT/UPDATE/DELETE`，不再包含 `SELECT`。
-- 因为 `Read access for all` 已经覆盖了所有人的读取权限（包括 admin）。

DROP POLICY IF EXISTS "Write access for admins" ON public.system_settings;

CREATE POLICY "Admins can update system settings"
ON public.system_settings
FOR UPDATE
USING (
  public.is_admin()
);

CREATE POLICY "Admins can insert system settings"
ON public.system_settings
FOR INSERT
WITH CHECK (
  public.is_admin()
);

CREATE POLICY "Admins can delete system settings"
ON public.system_settings
FOR DELETE
USING (
  public.is_admin()
);

-- 注意：不需要再为 admins 创建 SELECT 策略，因为现有的 "Read access for all" 已经允许所有人读取。
