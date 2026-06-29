-- Migration: 008_matching_rule_weights
-- Description: Seed system settings with matching rule weights config

INSERT INTO system_settings (key, value, description) VALUES
    ('matching.rule_weights',
     '{"city_match": 30, "zip_code_match": 40, "specialty_match": 30}',
     'Weights for matching engine rules: city_match, zip_code_match, specialty_match. Weights should sum to 100 to represent percentage match.')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description;
