-- Customer Feedback Tickets, step 23: a ticket's department parts.
--
-- One ticket (one FB number) can go to several departments; each gets a part:
--   OPERATIONS  uses the ticket's own columns (issue_summary, priority, action, visit, re-visit). Its
--               work is done when the re-visit is completed (or the action needs no visit).
--   ACCOUNTS    keeps its own issue_summary, priority and invoice_ids (JSON list of invoices.id of the
--               customer). The Accounts team marks it DONE with a note (e.g. "Invoice sent").
-- The follow-up call is due when every part is done; a satisfied customer then closes the ticket.
--
-- Every existing ticket gets an OPERATIONS part (that is what they were). Needs step 22.
-- New table + backfill. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_ticket_parts` (
  `id`             CHAR(36)     NOT NULL,
  `ticket_id`      CHAR(36)     NOT NULL,
  `kind`           ENUM('OPERATIONS','ACCOUNTS') NOT NULL,
  `issue_summary`  VARCHAR(500) NULL,
  `priority`       ENUM('LOW','MEDIUM','HIGH') NULL,
  `invoice_ids`    JSON         NULL,
  `status`         ENUM('PENDING','DONE') NOT NULL DEFAULT 'PENDING',
  `done_by`        BIGINT       NULL,
  `done_at`        DATETIME     NULL,
  `done_note`      VARCHAR(500) NULL,
  `created_at`     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ftp_ticket_kind` (`ticket_id`, `kind`),
  KEY `idx_ftp_kind_status` (`kind`, `status`),
  CONSTRAINT `fk_ftp_ticket`  FOREIGN KEY (`ticket_id`) REFERENCES `feedback_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ftp_done_by` FOREIGN KEY (`done_by`)   REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `feedback_ticket_parts` (`id`, `ticket_id`, `kind`, `issue_summary`, `priority`)
SELECT UUID(), t.id, 'OPERATIONS', t.issue_summary, t.priority
FROM `feedback_tickets` t
WHERE NOT EXISTS (SELECT 1 FROM `feedback_ticket_parts` p WHERE p.ticket_id = t.id);
