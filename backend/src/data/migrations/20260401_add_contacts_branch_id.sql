ALTER TABLE contacts
  ADD COLUMN branch_id CHAR(36) NULL;

CREATE INDEX idx_contacts_branch_id ON contacts (branch_id);

-- Backfill from jobs (contacts linked to jobs)
UPDATE contacts c
JOIN jobs j ON j.requested_by_contact_id = c.id
SET c.branch_id = j.branch_id
WHERE c.branch_id IS NULL
  AND j.branch_id IS NOT NULL;

-- Backfill from users (users linked to contacts)
UPDATE contacts c
JOIN users u ON u.contact_id = c.id
SET c.branch_id = u.branch_id
WHERE c.branch_id IS NULL
  AND u.branch_id IS NOT NULL;
