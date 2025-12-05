-- Add category column to questions table
ALTER TABLE questions ADD COLUMN category TEXT DEFAULT '基础知识';

-- Comment on column
COMMENT ON COLUMN questions.category IS 'Question Category: 基础知识, 易错题, 写解析, 标准理解';
