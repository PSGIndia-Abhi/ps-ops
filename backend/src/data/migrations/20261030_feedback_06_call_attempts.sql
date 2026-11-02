-- Customer Feedback Tickets, step 6 of 15: calls made for a monthly feedback call.
--
-- feedback_call_attempts: one row per call the collector records (answered or not).
-- contact_name / phone are copied at call time, so a later edit of the contact doesn't
-- change the history.
--
-- Needs: 05_requests, contacts, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_call_attempts` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `request_id`        CHAR(36)     NOT NULL,
  `contact_id`        CHAR(36)     NULL,
  `contact_name`      VARCHAR(150) NULL,
  `phone`             VARCHAR(20)  NOT NULL,
  `outcome`           ENUM('ANSWERED','NO_ANSWER','BUSY','WRONG_NUMBER') NOT NULL,
  `called_by_user_id` BIGINT       NOT NULL,
  `called_at`         DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fca_request_called` (`request_id`, `called_at`),
  CONSTRAINT `fk_fca_request`   FOREIGN KEY (`request_id`)        REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fca_contact`   FOREIGN KEY (`contact_id`)        REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fca_called_by` FOREIGN KEY (`called_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
