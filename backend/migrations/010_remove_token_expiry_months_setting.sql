-- Migration: 010_remove_token_expiry_months_setting
-- Description: Delete the unused token.expiry_months system setting

DELETE FROM system_settings WHERE key = 'token.expiry_months';
