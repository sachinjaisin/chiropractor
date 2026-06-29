-- Migration: 016_add_profile_pic_to_users
-- Description: Add optional profile_pic_url column to users table

ALTER TABLE users ADD COLUMN profile_pic_url TEXT;
