-- 2026-add-popups.sql
-- Popup system: time-windowed site popups, optionally linked to a news item.

CREATE TABLE IF NOT EXISTS popups (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  image_url VARCHAR(500),
  link_url VARCHAR(500),
  link_label VARCHAR(100),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 0,
  related_news_id INT REFERENCES news(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT popups_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_popups_active_window ON popups (is_active, start_at, end_at);
