-- 2026-saas-05-conversions.sql
-- 문서 미리보기용 PDF 변환 추적 (CloudConvert)

CREATE TABLE IF NOT EXISTS file_conversions (
  id SERIAL PRIMARY KEY,
  source_pathname VARCHAR(500) UNIQUE NOT NULL,
  preview_pathname VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider VARCHAR(50) NOT NULL DEFAULT 'cloudconvert',
  job_id VARCHAR(100),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_conversions_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_file_conversions_job ON file_conversions (job_id);
