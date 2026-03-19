-- Update categories for questions that have the old values
UPDATE questions 
SET category = '默认' 
WHERE category IN ('问题确认', '匹配性');
