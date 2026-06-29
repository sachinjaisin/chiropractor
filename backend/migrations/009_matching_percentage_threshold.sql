-- Migration: 009_matching_percentage_threshold
-- Description: Seed system settings with matching minimum percentage threshold config

INSERT INTO system_settings (key, value, description) VALUES
    ('matching.min_match_percentage',
     '50',
     'Minimum match percentage (0 to 100) required for a chiropractor to be eligible to view a referral.')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description;
