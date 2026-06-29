-- Rollback: 010_remove_token_expiry_months_setting
-- Description: Re-insert the token.expiry_months system setting

INSERT INTO system_settings (key, value, description) VALUES
    ('token.expiry_months',
     'null',
     'Months until allocated tokens expire (null = never)')
ON CONFLICT (key) DO NOTHING;
