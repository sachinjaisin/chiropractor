-- Rollback: 008_matching_rule_weights
-- Description: Remove matching rule weights config from system settings

DELETE FROM system_settings WHERE key = 'matching.rule_weights';
