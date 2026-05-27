-- 2026-add-news-attachments.sql
-- Add a JSONB column to store an array of file attachments on news items.
-- Each entry: { "name": string, "pathname": string, "size": number, "type": string }

ALTER TABLE news ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
