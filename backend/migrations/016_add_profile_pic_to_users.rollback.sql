-- Rollback: 016_add_profile_pic_to_users
-- Description: Remove optional profile_pic_url column from users table

ALTER TABLE users DROP COLUMN IF EXISTS profile_pic_url;
