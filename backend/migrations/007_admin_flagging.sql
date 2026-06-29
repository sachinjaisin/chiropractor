-- Migration: 007_admin_flagging
-- Description: Add is_flagged column to practitioners table

ALTER TABLE practitioners ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
