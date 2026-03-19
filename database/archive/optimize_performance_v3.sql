-- 性能优化 Round 3：终极优化

-- 1. 修复 public.questions 表 (解决 "re-evaluates auth.role()" 警告)
-- 将 auth.role() 包装在 (select ...) 中
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.questions;
CREATE POLICY "Enable insert for authenticated users only" 
ON public.questions 
FOR INSERT 
WITH CHECK ( (select auth.role()) = 'authenticated' );

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.questions;
CREATE POLICY "Enable update for authenticated users only" 
ON public.questions 
FOR UPDATE 
USING ( (select auth.role()) = 'authenticated' );

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.questions;
CREATE POLICY "Enable delete for authenticated users only" 
ON public.questions 
FOR DELETE 
USING ( (select auth.role()) = 'authenticated' );


-- 2. 微调 public.profiles 表 (解决剩余的 "re-evaluates" 警告)
-- 技巧：将函数调用也包装在 (select ...) 中，强制作为标量值处理，避免每行执行

-- 重新定义更新策略
DROP POLICY IF EXISTS "Unified update for profiles" ON public.profiles; -- 清理可能的旧名
DROP POLICY IF EXISTS "Users update own or Super Admin updates all" ON public.profiles;

CREATE POLICY "Users update own or Super Admin updates all"
ON public.profiles
FOR UPDATE
USING (
  ((select auth.uid()) = id) 
  OR 
  (select public.is_super_admin())
);

-- 重新定义删除策略
DROP POLICY IF EXISTS "Super Admins can delete any profile" ON public.profiles;

CREATE POLICY "Super Admins can delete any profile"
ON public.profiles
FOR DELETE
USING (
  (select public.is_super_admin())
);
