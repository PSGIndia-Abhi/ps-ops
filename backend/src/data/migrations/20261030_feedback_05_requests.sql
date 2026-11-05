-- Customer Feedback Tickets, step 5 of 15: the monthly feedback calls.
--
-- feedback_requests: one row per customer site per month - the call the feedback collector
-- makes about that month's service. The collector picks a month; the call list shows every
-- site that had a completed visit in it (read straight from job_visits / jobs). The row is
-- created when a collector first works on that site for that month, and the collector who
-- does so takes it (collector_user_id); the desk can re-assign it.
--
--   period_month  first day of the month, e.g. 2026-10-01
--   status        TO_CALL -> NOT_ANSWERED / FORM_SENT -> FORM_RECEIVED -> DONE
--   result        GOOD (no issue) or ISSUE (at least one ticket raised), set when DONE
--   next_call_at  the customer asked to be called back at this time
--   row_version   bumped on every update; an update sent with an older value is refused
--
-- This is not a ticket: tickets (step 10) are raised from it only when there is an issue.
-- Needs: companies, sites, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_requests` (
  `id`                   CHAR(36)    NOT NULL,
  `period_month`         DATE        NOT NULL,
  `company_id`           VARCHAR(20) NOT NULL,
  `site_id`              VARCHAR(20) NOT NULL,
  `collector_user_id`    BIGINT      NULL,
  `status`               ENUM('TO_CALL','NOT_ANSWERED','FORM_SENT','FORM_RECEIVED','DONE') NOT NULL DEFAULT 'TO_CALL',
  `result`               ENUM('GOOD','ISSUE') NULL,
  `latest_submission_id` CHAR(36)    NULL,
  `next_call_at`         DATETIME    NULL,
  `done_by`              BIGINT      NULL,
  `done_at`              DATETIME    NULL,
  `created_by`           BIGINT      NULL,
  `row_version`          INT         NOT NULL DEFAULT 0,
  `created_at`           DATETIME    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_freq_site_month` (`site_id`, `period_month`),
  KEY `idx_freq_month_status` (`period_month`, `status`),
  KEY `idx_freq_collector_status` (`collector_user_id`, `status`),
  KEY `idx_freq_company_month` (`company_id`, `period_month`),
  KEY `idx_freq_next_call` (`next_call_at`),
  CONSTRAINT `fk_freq_company`    FOREIGN KEY (`company_id`)        REFERENCES `companies` (`id`),
  CONSTRAINT `fk_freq_site`       FOREIGN KEY (`site_id`)           REFERENCES `sites` (`id`),
  CONSTRAINT `fk_freq_collector`  FOREIGN KEY (`collector_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_freq_done_by`    FOREIGN KEY (`done_by`)           REFERENCES `users` (`id`),
  CONSTRAINT `fk_freq_created_by` FOREIGN KEY (`created_by`)        REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
