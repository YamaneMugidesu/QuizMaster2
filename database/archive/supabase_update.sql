
-- 添加 questions 表的 needs_grading 字段
ALTER TABLE questions ADD COLUMN IF NOT EXISTS needs_grading BOOLEAN DEFAULT false;

-- 添加 quiz_results 表的 status 字段
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

-- 更新现有的简答题，默认设为不需要人工批改（或者你可以手动在后台修改）
-- 如果你想把所有现有的简答题都设为需要批改，可以取消下面这行的注释：
-- UPDATE questions SET needs_grading = true WHERE type = 'SHORT_ANSWER';
