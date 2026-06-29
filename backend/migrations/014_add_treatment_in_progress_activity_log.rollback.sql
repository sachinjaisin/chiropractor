-- Rollback for Migration: 014_add_treatment_in_progress_activity_log
-- Description: Remove TREATMENT_IN_PROGRESS from referral_activity_logs.event_type check constraint

ALTER TABLE referral_activity_logs DROP CONSTRAINT referral_activity_logs_event_type_check;

ALTER TABLE referral_activity_logs ADD CONSTRAINT referral_activity_logs_event_type_check CHECK (event_type IN (
    'CREATED','PUBLISHED','VIEWED','CLAIMED',
    'PATIENT_CONTACTED','APPOINTMENT_BOOKED',
    'COMPLETED','CLOSED','REASSIGNED','EXPIRED'
));
