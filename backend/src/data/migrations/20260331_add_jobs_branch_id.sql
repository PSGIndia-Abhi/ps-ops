ALTER TABLE jobs
  ADD COLUMN branch_id CHAR(36) NULL;

UPDATE jobs j
JOIN users u ON u.id = j.supervisor_id
SET j.branch_id = u.branch_id
WHERE j.branch_id IS NULL
  AND j.supervisor_id IS NOT NULL
  AND u.branch_id IS NOT NULL;

UPDATE jobs j
JOIN users u ON u.id = j.created_by_user_id
SET j.branch_id = u.branch_id
WHERE j.branch_id IS NULL
  AND j.created_by_user_id IS NOT NULL
  AND u.branch_id IS NOT NULL;

CREATE INDEX idx_jobs_branch_id ON jobs (branch_id);
