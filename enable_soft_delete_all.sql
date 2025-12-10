-- Enable Soft Delete for Questions and Quiz Configs

-- 1. Add is_deleted to questions
ALTER TABLE questions ADD COLUMN is_deleted BOOLEAN DEFAULT false;

-- 2. Add is_deleted to quiz_configs
ALTER TABLE quiz_configs ADD COLUMN is_deleted BOOLEAN DEFAULT false;
