-- Customer Feedback Tickets, step 7 of 15: feedback form links sent to customers.
--
-- feedback_form_links: a link the customer opens without logging in, sent when the call
-- isn't answered. Only the SHA-256 of the token is stored; the token itself is only in the
-- link. One submission per link: the public form refuses a link that is submitted, revoked
-- or past expires_at. Sending a new link revokes the request's earlier unused links.
--
-- Needs: 05_requests, contacts, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_form_links` (
  `id`           CHAR(36)    NOT NULL,
  `request_id`   CHAR(36)    NOT NULL,
  `token_hash`   CHAR(64)    NOT NULL,
  `contact_id`   CHAR(36)    NULL,
  `phone`        VARCHAR(20) NULL,
  `expires_at`   DATETIME    NOT NULL,
  `opened_at`    DATETIME    NULL,
  `submitted_at` DATETIME    NULL,
  `revoked_at`   DATETIME    NULL,
  `created_by`   BIGINT      NULL,
  `created_at`   DATETIME    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ffl_token` (`token_hash`),
  KEY `idx_ffl_request` (`request_id`),
  KEY `idx_ffl_expires` (`expires_at`),
  CONSTRAINT `fk_ffl_request`    FOREIGN KEY (`request_id`) REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ffl_contact`    FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ffl_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
