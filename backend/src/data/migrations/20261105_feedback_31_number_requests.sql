-- Customer Feedback, step 31: requests for the right number (Feedback Desk > Requests).
--
-- When a call reaches a wrong number, the collector sends a request; the service coordinator (or a
-- desk manager) finds the right number and saves it on the site's contacts. The call goes back on
-- the collector's list to call again.
--
-- feedback_number_requests: one row per request.
--   request_id / site_id / company_id  the call and its site
--   contact_id, wrong_name, wrong_phone the contact / number that was wrong
--   note                               what the collector adds
--   status                             OPEN, DONE (right number saved) or CANCELLED (by the collector)
--   new_contact_id, new_name, new_phone the right number saved; resolve_note
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_number_requests` (
  `id`              CHAR(36)     NOT NULL,
  `request_id`      CHAR(36)     NOT NULL,
  `company_id`      VARCHAR(20)  NOT NULL,
  `site_id`         VARCHAR(20)  NOT NULL,
  `contact_id`      CHAR(36)     NULL DEFAULT NULL,
  `wrong_name`      VARCHAR(150) NULL DEFAULT NULL,
  `wrong_phone`     VARCHAR(20)  NULL DEFAULT NULL,
  `note`            VARCHAR(500) NULL DEFAULT NULL,
  `status`          ENUM('OPEN','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `requested_by`    BIGINT       NOT NULL,
  `requested_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_by`     BIGINT       NULL DEFAULT NULL,
  `resolved_at`     DATETIME     NULL DEFAULT NULL,
  `new_contact_id`  CHAR(36)     NULL DEFAULT NULL,
  `new_name`        VARCHAR(150) NULL DEFAULT NULL,
  `new_phone`       VARCHAR(20)  NULL DEFAULT NULL,
  `resolve_note`    VARCHAR(500) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fnr_status` (`status`, `requested_at`),
  KEY `idx_fnr_call` (`request_id`),
  KEY `idx_fnr_by` (`requested_by`, `status`),
  CONSTRAINT `fk_fnr_call` FOREIGN KEY (`request_id`) REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fnr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_fnr_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
