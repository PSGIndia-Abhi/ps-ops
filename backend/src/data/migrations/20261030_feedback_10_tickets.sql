-- Customer Feedback Tickets, step 10 of 15: tickets - raised only when there is an issue.
--
-- feedback_tickets: raised by the feedback collector from a feedback (a submission) that
-- shows an issue. Not created for good feedback and not created by visits. A monthly call
-- can raise more than one ticket (separate issues). The Feedback Desk / Operations works it
-- to CLOSED.
--
--   seq / ticket_number  seq is the running number; the code sets ticket_number to
--                        'FB-' + seq padded to at least 4 digits (FB-0142, FB-12345) in the same
--                        transaction as the insert (MySQL can't build it as a generated column
--                        from an AUTO_INCREMENT column).
--   visit_id / job_id    optional: the visit of that month the issue is about
--   status               ACTION_PENDING -> CLOSED (reopen goes back to ACTION_PENDING)
--   suggested_priority   highest suggestion among the bad answers; priority = the one chosen
--   row_version          bumped on every update; an update sent with an older value is refused
--
-- Tickets are never deleted from the app - they are closed. Times are IST wall-clock.
-- Needs: 05_requests, 08_submissions, companies, sites, jobs, job_visits, users.
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_tickets` (
  `id`                   CHAR(36)     NOT NULL,
  `seq`                  BIGINT       NOT NULL AUTO_INCREMENT,
  `ticket_number`        VARCHAR(20)  NULL,
  `request_id`           CHAR(36)     NOT NULL,
  `submission_id`        CHAR(36)     NULL,
  `period_month`         DATE         NOT NULL,
  `company_id`           VARCHAR(20)  NOT NULL,
  `site_id`              VARCHAR(20)  NOT NULL,
  `visit_id`             CHAR(36)     NULL,
  `job_id`               CHAR(36)     NULL,
  `service_label`        VARCHAR(150) NULL,
  `technician_user_id`   BIGINT       NULL,
  `issue_summary`        VARCHAR(500) NULL,
  `status`               ENUM('ACTION_PENDING','CLOSED') NOT NULL DEFAULT 'ACTION_PENDING',
  `suggested_priority`   ENUM('LOW','MEDIUM','HIGH') NULL,
  `priority`             ENUM('LOW','MEDIUM','HIGH') NOT NULL,
  `action`               ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS') NOT NULL,
  `action_owner_user_id` BIGINT       NULL,
  `action_due_at`        DATETIME     NULL,
  `action_note`          TEXT         NULL,
  `revisit_visit_id`     CHAR(36)     NULL,
  `raised_by`            BIGINT       NOT NULL,
  `closed_by`            BIGINT       NULL,
  `closed_at`            DATETIME     NULL,
  `close_note`           VARCHAR(500) NULL,
  `row_version`          INT          NOT NULL DEFAULT 0,
  `created_at`           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ft_seq` (`seq`),
  UNIQUE KEY `uniq_ft_ticket_number` (`ticket_number`),
  KEY `idx_ft_request` (`request_id`),
  KEY `idx_ft_status_priority` (`status`, `priority`),
  KEY `idx_ft_owner_status` (`action_owner_user_id`, `status`),
  KEY `idx_ft_raised_by` (`raised_by`, `status`),
  KEY `idx_ft_company_site` (`company_id`, `site_id`, `created_at`),
  KEY `idx_ft_created` (`created_at`),
  CONSTRAINT `fk_ft_request`    FOREIGN KEY (`request_id`)           REFERENCES `feedback_requests` (`id`),
  CONSTRAINT `fk_ft_submission` FOREIGN KEY (`submission_id`)        REFERENCES `feedback_submissions` (`id`),
  CONSTRAINT `fk_ft_company`    FOREIGN KEY (`company_id`)           REFERENCES `companies` (`id`),
  CONSTRAINT `fk_ft_site`       FOREIGN KEY (`site_id`)              REFERENCES `sites` (`id`),
  CONSTRAINT `fk_ft_visit`      FOREIGN KEY (`visit_id`)             REFERENCES `job_visits` (`id`),
  CONSTRAINT `fk_ft_job`        FOREIGN KEY (`job_id`)               REFERENCES `jobs` (`id`),
  CONSTRAINT `fk_ft_revisit`    FOREIGN KEY (`revisit_visit_id`)     REFERENCES `job_visits` (`id`),
  CONSTRAINT `fk_ft_technician` FOREIGN KEY (`technician_user_id`)   REFERENCES `users` (`id`),
  CONSTRAINT `fk_ft_owner`      FOREIGN KEY (`action_owner_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ft_raised_by`  FOREIGN KEY (`raised_by`)            REFERENCES `users` (`id`),
  CONSTRAINT `fk_ft_closed_by`  FOREIGN KEY (`closed_by`)            REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
