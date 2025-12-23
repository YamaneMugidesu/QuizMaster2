-- 性能优化脚本：合并 RLS 策略并减少重复计算

-- 1. 创建稳定的辅助函数以避免在每一行重复执行子查询
-- 这些函数被标记为 STABLE，Postgres 可以在每个语句中缓存结果

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'SUPER_ADMIN',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('SUPER_ADMIN', 'ADMIN'),
    false
  );
$$;

-- 2. 优化 profiles 表的策略 (解决 "Multiple Permissive Policies" 警告)
-- 删除旧的分离策略
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Super Admins can delete any profile" ON public.profiles;

-- 创建合并后的高效策略
CREATE POLICY "Users update own or Super Admin updates all"
ON public.profiles
FOR UPDATE
USING (
  (auth.uid() = id) OR public.is_super_admin()
);

CREATE POLICY "Super Admins can delete any profile"
ON public.profiles
FOR DELETE
USING (
  public.is_super_admin()
);

-- 3. 优化 system_settings 表的策略 (解决 "Unnecessary Re-evaluation" 警告)
DROP POLICY IF EXISTS "Write access for admins" ON public.system_settings;

CREATE POLICY "Write access for admins"
ON public.system_settings
FOR ALL
USING (
  public.is_admin()
);

-- 4. 优化 questions 表的策略 (可选，使用 stable 函数替代直接调用)
-- 虽然 auth.role() 也是函数，但这里我们确保它只被调用一次或使用更清晰的逻辑
-- 现有的 questions 策略比较简单，通常不需要改动，但为了统一风格可以保留原样或微调。
-- 这里主要解决 profiles 和 system_settings 的明显性能问题。
