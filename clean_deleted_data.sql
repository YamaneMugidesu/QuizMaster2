-- 物理清理已软删除的数据 (Hard Delete)
-- 警告：此操作不可恢复！

-- 1. 清理已删除的题目 (Questions)
-- 注意：如果题目已经被某些答题记录引用，此操作可能会失败（取决于外键约束）。
-- 如果失败，说明该题目是历史成绩的一部分，建议保留软删除状态。
DELETE FROM questions WHERE is_deleted = true;

-- 2. 清理已删除的试卷配置 (Quiz Configs)
DELETE FROM quiz_configs WHERE is_deleted = true;

-- 3. 清理已删除的用户 (Users)
-- 同样，如果用户有答题记录，可能会受到外键保护。
DELETE FROM profiles WHERE is_deleted = true;
