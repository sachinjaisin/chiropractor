-- Rollback: 009_matching_percentage_threshold
-- Description: Remove matching minimum percentage threshold config from system settings

DELETE FROM system_settings WHERE key = 'matching.min_match_percentage';
