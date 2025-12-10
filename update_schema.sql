-- Add is_published column to quiz_configs table
-- Default is set to TRUE so that existing quizzes remain visible to users.
-- New quizzes created via the Admin interface will default to FALSE (draft mode) if logic dictates, 
-- but our code currently doesn't specify a default in the insert payload (it might be undefined).
-- In storageService.ts saveQuizConfig:
-- is_published: rest.isPublished
-- If rest.isPublished is undefined, Supabase might insert NULL or the default.
-- It is recommended to run this in your Supabase SQL Editor.

ALTER TABLE quiz_configs ADD COLUMN is_published BOOLEAN DEFAULT true;
