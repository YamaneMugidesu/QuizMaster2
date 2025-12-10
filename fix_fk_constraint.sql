-- Fix for Foreign Key Constraint Violation when deleting users
-- Run this in your Supabase SQL Editor to enable automatic deletion of related records.

-- 1. Drop the existing constraint
ALTER TABLE quiz_results
DROP CONSTRAINT quiz_results_user_id_fkey;

-- 2. Re-add the constraint with ON DELETE CASCADE
ALTER TABLE quiz_results
ADD CONSTRAINT quiz_results_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE CASCADE;
