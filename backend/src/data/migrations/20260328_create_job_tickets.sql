CREATE TABLE IF NOT EXISTS job_tickets (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_tickets_job (job_id),
  INDEX idx_job_tickets_status (status),
  INDEX idx_job_tickets_creator (created_by_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_ticket_messages (
  id VARCHAR(36) PRIMARY KEY,
  ticket_id VARCHAR(36) NOT NULL,
  message TEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_ticket_messages_ticket (ticket_id),
  INDEX idx_job_ticket_messages_creator (created_by_user_id),
  CONSTRAINT fk_ticket_messages_ticket
    FOREIGN KEY (ticket_id) REFERENCES job_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;
