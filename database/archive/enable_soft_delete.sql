-- Enable Soft Delete for Users
-- This allows "deleting" a user while keeping their quiz records intact.

-- 1. Add is_deleted column to profiles table
ALTER TABLE profiles ADD COLUMN is_deleted BOOLEAN DEFAULT false;
