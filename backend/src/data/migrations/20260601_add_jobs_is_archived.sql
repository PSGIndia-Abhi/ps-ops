ALTER TABLE jobs
  ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

CREATE INDEX idx_jobs_is_archived ON jobs (is_archived);
