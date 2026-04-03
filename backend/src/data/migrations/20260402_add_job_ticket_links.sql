CREATE TABLE IF NOT EXISTS job_ticket_links (
  id VARCHAR(36) PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  job_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_links_ticket (ticket_id),
  INDEX idx_ticket_links_job (job_id),
  CONSTRAINT fk_ticket_links_ticket
    FOREIGN KEY (ticket_id) REFERENCES job_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_links_job
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE job_tickets
  MODIFY job_id VARCHAR(64) NULL;

INSERT INTO job_ticket_links (id, ticket_id, job_id)
SELECT UUID(), jt.id, jt.job_id
FROM job_tickets jt
WHERE jt.job_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM job_ticket_links l
    WHERE l.ticket_id = jt.id AND l.job_id = jt.job_id
  );
