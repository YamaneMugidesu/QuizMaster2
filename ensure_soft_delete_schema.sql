-- Enable Soft Delete for ALL Tables (Users, Questions, Quiz Configs)
-- 运行此脚本可确保所有相关表都支持软删除

-- 1. 为用户表添加 is_deleted (如果之前没运行过 enable_soft_delete.sql)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 2. 为题目表添加 is_deleted
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 3. 为试卷配置表添加 is_deleted
ALTER TABLE quiz_configs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
