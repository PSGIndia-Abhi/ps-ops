-- Customer Feedback Tickets, step 8 of 15: one set of answers.
--
-- feedback_submissions: the answers collected once - on a call (source CALL, collected_by set)
-- or on the customer form (source FORM, form_link_id set). Saved whether or not there is an
-- issue, so the customer report shows every feedback. The answers themselves are in
-- feedback_responses (step 9). spoke_with_name is who gave the feedback ("Given by").
--
-- Needs: 05_requests, 07_form_links, contacts, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_submissions` (
  `id`                   CHAR(36)     NOT NULL,
  `request_id`           CHAR(36)     NOT NULL,
  `source`               ENUM('CALL','FORM') NOT NULL,
  `form_link_id`         CHAR(36)     NULL,
  `contact_id`           CHAR(36)     NULL,
  `spoke_with_name`      VARCHAR(150) NULL,
  `collected_by_user_id` BIGINT       NULL,
  `other_feedback`       TEXT         NULL,
  `has_issue`            TINYINT(1)   NOT NULL DEFAULT 0,
  `started_at`           DATETIME     NULL,
  `submitted_at`         DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fs_form_link` (`form_link_id`),
  KEY `idx_fs_request` (`request_id`, `submitted_at`),
  CONSTRAINT `fk_fs_request`      FOREIGN KEY (`request_id`)           REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_form_link`    FOREIGN KEY (`form_link_id`)         REFERENCES `feedback_form_links` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fs_contact`      FOREIGN KEY (`contact_id`)           REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fs_collected_by` FOREIGN KEY (`collected_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
