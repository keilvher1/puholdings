-- Add popup columns to news table
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_popup BOOLEAN DEFAULT false;
ALTER TABLE news ADD COLUMN IF NOT EXISTS popup_start_date DATE;
ALTER TABLE news ADD COLUMN IF NOT EXISTS popup_end_date DATE;
