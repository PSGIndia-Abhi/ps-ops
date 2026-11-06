-- =============================================================================================
-- Customer Feedback - ALL database changes in one file: steps 01 to 33, in order.
--
-- Every step is safe to run again: tables are created only when missing, columns added only when
-- missing, seed rows and permissions only when not there yet. So it can run on a database that has
-- none of it, some of it (e.g. steps 01-21 already) or all of it - it brings it to step 33.
--
-- How to run (production):
--   1. Take a backup first:  mysqldump -u <user> -p <database> > backup_before_feedback.sql
--   2. Run this whole file once:
--        mysql -u <user> -p <database> < feedback_production_upgrade.sql
--      (or open it in MySQL Workbench / phpMyAdmin and run everything). If it stops on an error,
--      fix the cause and run the whole file again.
--   3. Check the results at the bottom, then deploy the new backend / website and the new app.
--   4. Then set up Feedback Desk > Masters > Call schedule: only sites with a schedule get calls.
--
-- Made from backend/src/data/migrations/*_feedback_01 ... _33 (steps 16, 21 and 24 rewritten to be
-- safe to re-run; the result is the same).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Step 01 · 20261030_feedback_01_questions.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 1 of 15: the questions master.



--
-- feedback_questions: the questions asked on every feedback call (Android app) and on the
-- customer's WhatsApp form. Kept by admins in Masters -> Feedback questions (FEEDBACK_ADMIN).
-- A question that has been answered is never deleted - it is switched off (is_active = 0),
-- because feedback_responses keeps a copy of the wording that was asked.
--   is_required   the app and the form refuse to save without an answer to it
--   show_on_form  also asked on the customer's WhatsApp form (always asked on a call)
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_questions` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `question_text` VARCHAR(255) NOT NULL,
  `sort_order`    INT          NOT NULL DEFAULT 0,
  `is_required`   TINYINT(1)   NOT NULL DEFAULT 1,
  `show_on_form`  TINYINT(1)   NOT NULL DEFAULT 1,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`    BIGINT       NULL,
  `updated_by`    BIGINT       NULL,
  `created_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fq_active_order` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 02 · 20261030_feedback_02_question_options.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 2 of 15: the answers of each question.
--
-- feedback_question_options: the fixed answers a question offers (Yes / Partly / No ...).
--   is_bad              the answer means there is an issue (shown red; the app offers "Raise ticket")
--   suggested_priority  for a bad answer: the priority it suggests. A raised ticket's suggested
--                       priority is the highest among its answers; the collector can change it.
-- Like questions, an answer that has been used is switched off, never deleted.
--
-- Needs: 01_questions. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_question_options` (
  `id`                 INT                         NOT NULL AUTO_INCREMENT,
  `question_id`        INT                         NOT NULL,
  `label`              VARCHAR(60)                 NOT NULL,
  `sort_order`         INT                         NOT NULL DEFAULT 0,
  `is_bad`             TINYINT(1)                  NOT NULL DEFAULT 0,
  `suggested_priority` ENUM('LOW','MEDIUM','HIGH') NULL,
  `is_active`          TINYINT(1)                  NOT NULL DEFAULT 1,
  `created_at`         DATETIME                    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME                    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fqo_question` (`question_id`, `is_active`, `sort_order`),
  CONSTRAINT `fk_fqo_question` FOREIGN KEY (`question_id`) REFERENCES `feedback_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 03 · 20261030_feedback_03_whatsapp_templates.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 3 of 15: WhatsApp message templates.
--
-- feedback_whatsapp_templates: the text of the WhatsApp messages the app fills in and opens
-- with a wa.me link (click-to-send - no WhatsApp provider, no webhook).
--   code       FEEDBACK_SUMMARY, REVISIT_BOOKED, FORM_LINK (looked up by the code)
--   body       placeholders {ticket} {priority} {customer} {site} {date} {feedback} {action}
--              {technician} {link} {collector}
--   audiences  who the template may be sent to
--   provider_template_name  empty in v1; for a WhatsApp provider added later
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_whatsapp_templates` (
  `id`                     INT                                       NOT NULL AUTO_INCREMENT,
  `code`                   VARCHAR(40)                               NOT NULL,
  `name`                   VARCHAR(100)                              NOT NULL,
  `body`                   TEXT                                      NOT NULL,
  `audiences`              SET('CUSTOMER','OPERATIONS','TECHNICIAN') NOT NULL,
  `provider_template_name` VARCHAR(100)                              NULL,
  `is_active`              TINYINT(1)                                NOT NULL DEFAULT 1,
  `updated_by`             BIGINT                                    NULL,
  `created_at`             DATETIME                                  NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME                                  NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fwt_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 04 · 20261030_feedback_04_settings.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 4 of 15: module settings.
--
-- feedback_settings: one row per setting (key and value), edited by admins.
-- The keys are seeded in step 14.
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_settings` (
  `setting_key`   VARCHAR(60)  NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_by`    BIGINT       NULL,
  `updated_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 05 · 20261030_feedback_05_requests.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 06 · 20261030_feedback_06_call_attempts.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 07 · 20261030_feedback_07_form_links.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 08 · 20261030_feedback_08_submissions.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 09 · 20261030_feedback_09_responses.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 9 of 15: the answer to each question.
--
-- feedback_responses: one row per question answered in a submission. question_text,
-- option_label, is_bad and suggested_priority are copied from the master at that moment, so
-- editing the questions later never changes feedback already given.
--
-- Needs: 08_submissions, 01_questions, 02_question_options. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_responses` (
  `id`                 BIGINT       NOT NULL AUTO_INCREMENT,
  `submission_id`      CHAR(36)     NOT NULL,
  `question_id`        INT          NOT NULL,
  `option_id`          INT          NOT NULL,
  `question_text`      VARCHAR(255) NOT NULL,
  `option_label`       VARCHAR(60)  NOT NULL,
  `is_bad`             TINYINT(1)   NOT NULL DEFAULT 0,
  `suggested_priority` ENUM('LOW','MEDIUM','HIGH') NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fr_submission_question` (`submission_id`, `question_id`),
  KEY `idx_fr_question_option` (`question_id`, `option_id`),
  CONSTRAINT `fk_fr_submission` FOREIGN KEY (`submission_id`) REFERENCES `feedback_submissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fr_question`   FOREIGN KEY (`question_id`)   REFERENCES `feedback_questions` (`id`),
  CONSTRAINT `fk_fr_option`     FOREIGN KEY (`option_id`)     REFERENCES `feedback_question_options` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 10 · 20261030_feedback_10_tickets.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 11 · 20261030_feedback_11_whatsapp_messages.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 11 of 15: WhatsApp messages opened.
--
-- feedback_whatsapp_messages: one row each time the app fills a template and opens WhatsApp
-- with it (wa.me link). Always belongs to a monthly call (request); ticket_id is set when the
-- message is about a raised ticket (summary to Operations, re-visit booked). Status is always
-- OPENED: whether the user then tapped Send is not known without a WhatsApp provider.
-- provider_message_id is empty in v1.
--
-- Needs: 05_requests, 10_tickets, 03_whatsapp_templates, contacts, users.
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_whatsapp_messages` (
  `id`                   CHAR(36)     NOT NULL,
  `request_id`           CHAR(36)     NOT NULL,
  `ticket_id`            CHAR(36)     NULL,
  `template_id`          INT          NULL,
  `recipient_type`       ENUM('CUSTOMER','OPERATIONS','TECHNICIAN','OTHER') NOT NULL,
  `recipient_user_id`    BIGINT       NULL,
  `recipient_contact_id` CHAR(36)     NULL,
  `phone`                VARCHAR(20)  NOT NULL,
  `body`                 TEXT         NOT NULL,
  `provider_message_id`  VARCHAR(100) NULL,
  `status`               ENUM('OPENED') NOT NULL DEFAULT 'OPENED',
  `opened_by`            BIGINT       NOT NULL,
  `opened_at`            DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fwm_provider_message` (`provider_message_id`),
  KEY `idx_fwm_request` (`request_id`, `opened_at`),
  KEY `idx_fwm_ticket` (`ticket_id`),
  CONSTRAINT `fk_fwm_request`   FOREIGN KEY (`request_id`)           REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fwm_ticket`    FOREIGN KEY (`ticket_id`)            REFERENCES `feedback_tickets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_template`  FOREIGN KEY (`template_id`)          REFERENCES `feedback_whatsapp_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_user`      FOREIGN KEY (`recipient_user_id`)    REFERENCES `users` (`id`),
  CONSTRAINT `fk_fwm_contact`   FOREIGN KEY (`recipient_contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_opened_by` FOREIGN KEY (`opened_by`)            REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 12 · 20261030_feedback_12_history.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 12 of 15: what happened on a monthly call and its tickets.
--
-- feedback_history: one row per event, shown as History on the call and on a ticket.
-- Always belongs to a request; ticket_id is set for ticket events.
--   event       request: OPENED, ASSIGNED, CALL_ATTEMPT, FORM_LINK_SENT, FORM_SUBMITTED, FORM_EXPIRED,
--                        FEEDBACK_SAVED, WHATSAPP_SENT, DONE
--               ticket:  TICKET_RAISED, PRIORITY_SET, ACTION_SET, OWNER_CHANGED, UPDATED, CLOSED, REOPENED
--   changed_by  NULL for system events (timed job) and customer form events
--
-- Needs: 05_requests, 10_tickets, users. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_history` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `request_id`  CHAR(36)     NOT NULL,
  `ticket_id`   CHAR(36)     NULL,
  `event`       VARCHAR(40)  NOT NULL,
  `from_status` VARCHAR(20)  NULL,
  `to_status`   VARCHAR(20)  NULL,
  `note`        VARCHAR(500) NULL,
  `changed_by`  BIGINT       NULL,
  `created_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fh_request_created` (`request_id`, `created_at`),
  KEY `idx_fh_ticket_created` (`ticket_id`, `created_at`),
  CONSTRAINT `fk_fh_request`    FOREIGN KEY (`request_id`) REFERENCES `feedback_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fh_ticket`     FOREIGN KEY (`ticket_id`)  REFERENCES `feedback_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fh_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------------------------
-- Step 13 · 20261030_feedback_13_seed_questions.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 13 of 15: the 5 starting questions and their answers.
--
-- Admins change them later in Masters -> Feedback questions. Fixed ids so the answers can
-- point at their question; INSERT IGNORE skips rows already there, so re-running doesn't
-- overwrite edits made in the master.
--
-- Needs: 01_questions, 02_question_options. Inserts rows only. Safe to re-run.

INSERT IGNORE INTO `feedback_questions` (`id`, `question_text`, `sort_order`) VALUES
  (1, 'Was the service done properly?', 1),
  (2, 'Is the problem solved?', 2),
  (3, 'Did the technician come on time?', 3),
  (4, 'Was the technician polite and in uniform?', 4),
  (5, 'Would you recommend BestServe?', 5);

INSERT IGNORE INTO `feedback_question_options` (`id`, `question_id`, `label`, `sort_order`, `is_bad`, `suggested_priority`) VALUES
  (1,  1, 'Yes',    1, 0, NULL),
  (2,  1, 'Partly', 2, 1, 'MEDIUM'),
  (3,  1, 'No',     3, 1, 'HIGH'),
  (4,  2, 'Yes',    1, 0, NULL),
  (5,  2, 'Partly', 2, 1, 'MEDIUM'),
  (6,  2, 'No',     3, 1, 'HIGH'),
  (7,  3, 'Yes',    1, 0, NULL),
  (8,  3, 'No',     2, 1, 'MEDIUM'),
  (9,  4, 'Yes',    1, 0, NULL),
  (10, 4, 'No',     2, 1, 'LOW'),
  (11, 5, 'Yes',    1, 0, NULL),
  (12, 5, 'Maybe',  2, 0, NULL),
  (13, 5, 'No',     3, 1, 'MEDIUM');

-- ---------------------------------------------------------------------------------------------
-- Step 14 · 20261030_feedback_14_seed_templates_settings.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 14 of 15: starting WhatsApp templates and settings.
--
-- Templates (edited later in Masters -> WhatsApp templates):
--   FEEDBACK_SUMMARY  to Operations / the technician after a complaint is saved
--   REVISIT_BOOKED    to the customer when a re-visit is booked from the ticket
--   FORM_LINK         to the customer when the call isn't answered
-- Settings (edited later in Masters -> Form link rules):
--   other_text_enabled             1  show the optional "Other feedback" box
--   link_expiry_days               3  days a form link stays valid
--   offer_link_after_missed_calls  1  missed calls before the app offers the form link
--   notify_collector_on_form       1  notify the collector when a form is submitted
--
-- Needs: 03_whatsapp_templates, 04_settings. Inserts rows only; re-running keeps edits.
-- Safe to re-run.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('FEEDBACK_SUMMARY', 'Feedback summary',
   'Ticket {ticket} · {priority}\n{customer}, {site} · service {date}\nFeedback: {feedback}\nAction: {action}',
   'OPERATIONS,TECHNICIAN'),
  ('REVISIT_BOOKED', 'Re-visit booked',
   'Hello, thank you for your feedback on the service at {site}. We have booked a re-visit on {date}. Ticket {ticket}. - {collector}, BestServe',
   'CUSTOMER'),
  ('FORM_LINK', 'Feedback form link',
   'Hello, we tried calling about your service on {date}. Please share feedback here: {link}',
   'CUSTOMER');

INSERT IGNORE INTO `feedback_settings` (`setting_key`, `setting_value`) VALUES
  ('other_text_enabled', '1'),
  ('link_expiry_days', '3'),
  ('offer_link_after_missed_calls', '1'),
  ('notify_collector_on_form', '1');

-- ---------------------------------------------------------------------------------------------
-- Step 15 · 20261030_feedback_15_permissions_role.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 15 of 15: permissions and the Feedback Collector role.
--
--   FEEDBACK_COLLECT  Android app: monthly call list, calls, answers, form links, raise tickets
--   FEEDBACK_VIEW     Feedback Desk and customer report: every call and ticket
--   FEEDBACK_MANAGE   change priority, owner and action; close and reopen tickets
--   FEEDBACK_ADMIN    Masters: questions, WhatsApp templates, form link rules
-- New role feedback_collector gets FEEDBACK_COLLECT. Operations Head and Operations Manager get
-- FEEDBACK_VIEW + FEEDBACK_MANAGE. Admin passes every check in code, so nothing is granted to it.
--
-- Adds rows to permissions, roles and role_permissions only. permissions.name and roles.name
-- have no unique key, so each insert is guarded. Safe to re-run.

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_COLLECT' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_COLLECT');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_VIEW' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_VIEW');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_MANAGE' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_MANAGE');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_ADMIN' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_ADMIN');

INSERT INTO `roles` (`name`)
SELECT 'feedback_collector' WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'feedback_collector');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'feedback_collector'
  AND p.name = 'FEEDBACK_COLLECT';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name IN ('Operations Head', 'Operations Manager')
  AND p.name IN ('FEEDBACK_VIEW', 'FEEDBACK_MANAGE');

-- ---------------------------------------------------------------------------------------------
-- Step 16 · 20261031_feedback_16_action_other.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 16: next step OTHER (here with the full list of next steps of step 28,
-- so this never narrows the column on a database that already has the later values).
ALTER TABLE `feedback_tickets`
  MODIFY `action` ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER','SITE_AUDIT','SUPERVISOR_VISIT','SALES') NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Step 17 · 20261102_feedback_17_thank_you_whatsapp.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 17: a WhatsApp thank-you for customers with no issue.
--
-- Adds one row to feedback_whatsapp_templates: THANK_YOU, sent to the customer from the call
-- screen when the call ends Good. No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('THANK_YOU', 'Thank you (no issue)',
   'Hello, thank you for your feedback and for choosing BestServe. We are glad you are happy with our service. For any service in future, please contact us. - {collector}, BestServe',
   'CUSTOMER');

-- ---------------------------------------------------------------------------------------------
-- Step 18 · 20261102_feedback_18_email_templates.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 18: email templates (Masters > Email templates).
--
-- feedback_email_templates: the three optional customer emails the collector opens in Gmail.
-- Codes are fixed; admin edits subject, message and on/off. Placeholders:
--   {contact} {customer} {site} {month} {ticket} {issue} {revisit_note} {action_taken} {sender}
-- {revisit_note} / {action_taken} become a full sentence, or nothing (the empty line is dropped).
-- Creates one table and adds 3 rows (INSERT IGNORE on the unique code). Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_email_templates` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(40)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `subject`     VARCHAR(200) NOT NULL,
  `body`        TEXT         NOT NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_by`  BIGINT       NULL,
  `created_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fet_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `feedback_email_templates` (`code`, `name`, `subject`, `body`) VALUES
  ('THANK_YOU', 'Thank you (no issue)',
   'Thank you for your feedback - BestServe',
   'Dear {contact},\n\nThank you for taking the time to share your feedback on the services carried out at {customer}, {site} during {month}.\n\nWe are glad to know that you are satisfied with our service. Your feedback helps us maintain the standard of quality you expect from BestServe.\n\nShould you require any service or assistance in the future, please feel free to contact us. We will be happy to help.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe'),
  ('ISSUE_RECEIVED', 'Issue received',
   'We have received your concern - Ticket {ticket} | BestServe',
   'Dear {contact},\n\nThank you for your feedback on the services carried out at {customer}, {site} during {month}.\n\nWe are sorry that our service did not fully meet your expectations. Your concern has been registered with us under ticket number {ticket}:\n\n"{issue}"\n\nOur operations team has been informed and will take the necessary action. {revisit_note}We will keep you informed of the progress.\n\nPlease quote ticket number {ticket} in any communication regarding this matter.\n\nWe apologise for the inconvenience and thank you for your patience.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe'),
  ('ISSUE_RESOLVED', 'Issue resolved',
   'Your concern has been resolved - Ticket {ticket} | BestServe',
   'Dear {contact},\n\nWe are pleased to inform you that the concern you raised regarding the services at {customer}, {site} (ticket number {ticket}) has been resolved.\n\n{action_taken}\n\nThank you for bringing this to our attention and for your patience while we addressed it.\n\nIf you notice any further issue, or require any service in the future, please feel free to contact us. We will be happy to help.\n\nWarm regards,\n{sender}\nCustomer Care, BestServe');

-- ---------------------------------------------------------------------------------------------
-- Step 19 · 20261103_feedback_19_issue_resolved_whatsapp.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 19: a WhatsApp "issue resolved" message for the customer.
--
-- Adds one row to feedback_whatsapp_templates: ISSUE_RESOLVED, sent to the customer from the call
-- or ticket screen once the ticket is closed (the customer confirmed on the follow-up call).
-- No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('ISSUE_RESOLVED', 'Issue resolved',
   'Hello, thank you for your patience. Your concern about the service at {site} (ticket {ticket}) has been resolved. We are glad it is sorted. For anything else, please contact us. - {collector}, BestServe',
   'CUSTOMER');

-- ---------------------------------------------------------------------------------------------
-- Step 20 · 20261104_feedback_20_ticket_raised_whatsapp.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 20: a WhatsApp "ticket raised" message for the customer.
--
-- Adds one row to feedback_whatsapp_templates: TICKET_RAISED, sent to the customer from the call
-- or ticket screen once a ticket is raised for their complaint (while it is open).
-- No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('TICKET_RAISED', 'Ticket raised',
   'Hello, thank you for your feedback on the service at {site}. We are sorry about the trouble - your concern is registered as ticket {ticket} and our team is working on it. We will update you soon. - {collector}, BestServe',
   'CUSTOMER');

-- ---------------------------------------------------------------------------------------------
-- Step 21 · 20261104_feedback_21_question_types.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 21: question types (General / Service) - columns added only when missing.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_questions' AND COLUMN_NAME = 'question_type');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `feedback_questions` ADD COLUMN `question_type` ENUM(''GENERAL'',''SERVICE'') NOT NULL DEFAULT ''GENERAL'' AFTER `question_text`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_questions' AND COLUMN_NAME = 'services');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `feedback_questions` ADD COLUMN `services` JSON NULL AFTER `question_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- Step 22 · 20261105_feedback_22_departments.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback Tickets, step 22: the departments a ticket can go to.
--
-- feedback_departments: which org departments (org_units, admin > Departments) take feedback tickets,
-- and what kind of work each one does on a ticket:
--   OPERATIONS  the existing flow - the issue, the visit it is about and a re-visit booked in Jobs
--   ACCOUNTS    an invoice-related issue: its summary, priority and the customer's invoice(s)
-- The admin switches a department on or off in Feedback > Masters > Settings. People of an active
-- department (user_org_units) get the Feedback app next to Task Management, and see only the tickets
-- that have a part for their department.
--
-- Starts with the departments named 'Operations Team' and 'Accounts Team' when they exist; the admin
-- can point either kind at another department later. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_departments` (
  `kind`         ENUM('OPERATIONS','ACCOUNTS') NOT NULL,
  `org_unit_id`  CHAR(36)   NOT NULL,
  `is_active`    TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`   INT        NOT NULL DEFAULT 0,
  `updated_by`   BIGINT     NULL,
  `created_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`),
  UNIQUE KEY `uniq_fd_org_unit` (`org_unit_id`),
  CONSTRAINT `fk_fd_org_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'OPERATIONS', u.id, 1, 1 FROM `org_units` u
WHERE u.name = 'Operations Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'ACCOUNTS', u.id, 1, 2 FROM `org_units` u
WHERE u.name = 'Accounts Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;

-- ---------------------------------------------------------------------------------------------
-- Step 23 · 20261105_feedback_23_ticket_parts.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 24 · 20261105_feedback_24_department_questions.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 24: department questions - the column added only when missing.
ALTER TABLE `feedback_questions`
  MODIFY COLUMN `question_type` ENUM('GENERAL','SERVICE','DEPARTMENT') NOT NULL DEFAULT 'GENERAL';
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_questions' AND COLUMN_NAME = 'departments');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `feedback_questions` ADD COLUMN `departments` JSON NULL AFTER `services`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- Step 25 · 20261105_feedback_25_any_department_and_call_results.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 25:
--
-- 1. Any department from the user hierarchy (org_units) can take feedback tickets, not only
--    Operations and Accounts. feedback_departments.kind and feedback_ticket_parts.kind become text
--    keys: OPERATIONS and ACCOUNTS stay as they are; a department the admin adds later gets a key
--    made from its name (for example QUALITY_TEAM). with_invoices = its ticket part can list the
--    customer's invoices (on for Accounts).
-- 2. A call whose last try was a wrong number shows as WRONG_NUMBER.
-- 3. A call closed because the customer never answered (calls missed and the form link expired
--    unused) is DONE with result NO_RESPONSE ("Not responded").
--
-- Widens columns only; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_departments`
  MODIFY `kind` VARCHAR(40) NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_departments' AND COLUMN_NAME = 'with_invoices');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_departments` ADD COLUMN `with_invoices` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `feedback_departments` SET `with_invoices` = 1 WHERE `kind` = 'ACCOUNTS';

ALTER TABLE `feedback_ticket_parts`
  MODIFY `kind` VARCHAR(40) NOT NULL;

ALTER TABLE `feedback_requests`
  MODIFY `status` ENUM('TO_CALL','NOT_ANSWERED','WRONG_NUMBER','FORM_SENT','FORM_RECEIVED','DONE') NOT NULL DEFAULT 'TO_CALL',
  MODIFY `result` ENUM('GOOD','ISSUE','NO_RESPONSE') NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------------------------
-- Step 26 · 20261105_feedback_26_issue_types.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 26: each department's issue types (Feedback Desk > Issues).
--
-- feedback_issue_types: the issues a ticket can raise for a department (feedback_departments.kind),
-- e.g. Operations: Services, Technicians, Grooming, Behaviour. When raising a ticket the collector
-- ticks one or more issues of each chosen department and types the details for each.
-- is_service = 1: the "Services" issue of Operations - it shows the month's services to pick (the
-- visit and technician go on the ticket) instead of a text box.
-- feedback_ticket_parts.issues: the issues ticked on that part, as
-- [{ "id": 3, "name": "Grooming", "text": "Technician came without uniform" }].
--
-- New permission FEEDBACK_ISSUES (manage departments and issue types), given to the Service
-- Coordinator role. Admin passes every check in code.
--
-- New table, a new column and permission rows only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_issue_types` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `department_kind`  VARCHAR(40)  NOT NULL,
  `name`             VARCHAR(100) NOT NULL,
  `is_service`       TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order`       INT          NOT NULL DEFAULT 0,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT       NULL,
  `updated_by`       BIGINT       NULL,
  `created_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fit_dept_name` (`department_kind`, `name`),
  KEY `idx_fit_dept` (`department_kind`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Starting issues (the admin / service coordinator edit them later).
INSERT IGNORE INTO `feedback_issue_types` (`department_kind`, `name`, `is_service`, `sort_order`) VALUES
  ('OPERATIONS', 'Services',   1, 1),
  ('OPERATIONS', 'Technicians', 0, 2),
  ('OPERATIONS', 'Grooming',   0, 3),
  ('OPERATIONS', 'Behaviour',  0, 4),
  ('ACCOUNTS',   'Invoice not received', 0, 1),
  ('ACCOUNTS',   'Wrong invoice amount', 0, 2),
  ('ACCOUNTS',   'Payment not updated',  0, 3),
  ('ACCOUNTS',   'GST / billing details', 0, 4);

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'issues');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts` ADD COLUMN `issues` JSON NULL AFTER `issue_summary`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_ISSUES' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_ISSUES');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_ISSUES';

-- ---------------------------------------------------------------------------------------------
-- Step 27 · 20261105_feedback_27_very_high_priority.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 27: a fourth priority, VERY_HIGH ("Very high"), above HIGH.
-- Widens the priority ENUMs of the feedback tables; existing values stay. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `priority`           ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NOT NULL,
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_ticket_parts`
  MODIFY `priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_question_options`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

ALTER TABLE `feedback_responses`
  MODIFY `suggested_priority` ENUM('LOW','MEDIUM','HIGH','VERY_HIGH') NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------------------------
-- Step 28 · 20261105_feedback_28_assigned_next_steps.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 28: next steps done by one assigned person.
--
-- 1. Three more next steps on a ticket: SITE_AUDIT ("Site audit") and SUPERVISOR_VISIT
--    ("Supervisor visit") are assigned to a supervisor; SALES ("Sales") to a salesperson. The
--    person is stored in action_owner_user_id; they see the ticket and mark their step done.
-- 2. action_done_by / action_done_at / action_done_note: who marked the step done, when, and what
--    was done. The follow-up call to the customer opens after that.
--
-- Widens a column and adds new ones; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `action` ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER','SITE_AUDIT','SUPERVISOR_VISIT','SALES') NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_tickets' AND COLUMN_NAME = 'action_done_at');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_tickets`
     ADD COLUMN `action_done_by` BIGINT NULL DEFAULT NULL AFTER `action_note`,
     ADD COLUMN `action_done_at` DATETIME NULL DEFAULT NULL AFTER `action_done_by`,
     ADD COLUMN `action_done_note` VARCHAR(500) NULL DEFAULT NULL AFTER `action_done_at`,
     ADD CONSTRAINT `fk_ft_action_done_by` FOREIGN KEY (`action_done_by`) REFERENCES `users` (`id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- Step 29 · 20261105_feedback_29_call_schedules.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 29: call schedules (Feedback Desk > Masters > Call schedule).
--
-- Feedback calls are no longer one per site every month. A site gets calls only when a schedule
-- covers it; sites without one get no calls.
--
-- feedback_schedules: one rule for a customer (all its sites, site_id NULL) or for one site (a
-- site's own rule wins over its customer's rule).
--   mode EVERY_N_DAYS        a call every `every_days` days (7, 15, 30...) from start_date, when the
--                            site had a service since the last call.
--   mode AFTER_EACH_SERVICE  a call the day after each service; first_services = only the first N
--                            services of the customer / site (e.g. a new customer's first 3), then
--                            then_every_days (or no more calls when NULL). first_services NULL =
--                            after every service.
--   service_types            only these services count (JSON list of service names); NULL = all.
--   start_date / end_date    when the rule applies (end_date NULL = no end).
--
-- feedback_requests (a call) gets its own dates: due_date (the day it is to be made) and
-- period_start / period_end (the services it asks about: from period_start, before period_end). period_month
-- stays (the month of due_date) so tickets and reports by month keep working. Calls before this
-- step keep their month: due_date = the 1st of that month.
-- One call per site and due date (was: one per site and month).
--
-- New permission FEEDBACK_SCHEDULE (manage call schedules) for Service Coordinator and Operations
-- Manager. Admin passes every check in code.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_schedules` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `company_id`       VARCHAR(20)  NOT NULL,
  `site_id`          VARCHAR(20)  NULL DEFAULT NULL,
  `mode`             ENUM('EVERY_N_DAYS','AFTER_EACH_SERVICE') NOT NULL,
  `every_days`       INT          NULL DEFAULT NULL,
  `first_services`   INT          NULL DEFAULT NULL,
  `then_every_days`  INT          NULL DEFAULT NULL,
  `service_types`    JSON         NULL,
  `start_date`       DATE         NOT NULL,
  `end_date`         DATE         NULL DEFAULT NULL,
  `note`             VARCHAR(300) NULL DEFAULT NULL,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT       NULL,
  `updated_by`       BIGINT       NULL,
  `created_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fs_company` (`company_id`, `is_active`),
  KEY `idx_fs_site` (`site_id`, `is_active`),
  CONSTRAINT `fk_fs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The call's own dates and the schedule that made it.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND COLUMN_NAME = 'due_date');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_requests`
     ADD COLUMN `due_date` DATE NULL DEFAULT NULL AFTER `period_month`,
     ADD COLUMN `period_start` DATE NULL DEFAULT NULL AFTER `due_date`,
     ADD COLUMN `period_end` DATE NULL DEFAULT NULL AFTER `period_start`,
     ADD COLUMN `schedule_id` INT NULL DEFAULT NULL AFTER `period_end`,
     ADD KEY `idx_freq_due` (`due_date`, `status`),
     ADD CONSTRAINT `fk_freq_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `feedback_schedules` (`id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Calls from before: their month's 1st is the due date, the whole month their services.
UPDATE `feedback_requests` SET `due_date` = `period_month` WHERE `due_date` IS NULL;
UPDATE `feedback_requests` SET `period_start` = `period_month` WHERE `period_start` IS NULL;
UPDATE `feedback_requests` SET `period_end` = DATE_ADD(`period_month`, INTERVAL 1 MONTH) WHERE `period_end` IS NULL;
ALTER TABLE `feedback_requests` MODIFY `due_date` DATE NOT NULL, MODIFY `period_start` DATE NOT NULL, MODIFY `period_end` DATE NOT NULL;

-- One call per site and due date (was one per site and month).
SET @has_new := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND INDEX_NAME = 'uniq_freq_site_due');
SET @sql := IF(@has_new = 0, 'ALTER TABLE `feedback_requests` ADD UNIQUE KEY `uniq_freq_site_due` (`site_id`, `due_date`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old := (SELECT COUNT(*) FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_requests' AND INDEX_NAME = 'uniq_freq_site_month');
SET @sql := IF(@has_old > 0, 'ALTER TABLE `feedback_requests` DROP INDEX `uniq_freq_site_month`, ADD KEY `idx_freq_site_month` (`site_id`, `period_month`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Who manages the schedules.
INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_SCHEDULE' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_SCHEDULE');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name IN ('Service Coordinator', 'Operations Manager')
  AND p.name = 'FEEDBACK_SCHEDULE';

-- ---------------------------------------------------------------------------------------------
-- Step 30 · 20261105_feedback_30_schedule_month_days.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 30: call schedules on dates of the month.
--
-- feedback_schedules.mode MONTH_DAYS: a call on the given days of every month (month_days, e.g.
-- [1] = the 1st of every month, [1, 15] = the 1st and the 15th; 31 = the month's last day in
-- shorter months) - when the site had a service since the last call.
--
-- Widens a column and adds one; existing rows keep their values. Safe to re-run.

ALTER TABLE `feedback_schedules`
  MODIFY `mode` ENUM('EVERY_N_DAYS','AFTER_EACH_SERVICE','MONTH_DAYS') NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_schedules' AND COLUMN_NAME = 'month_days');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_schedules` ADD COLUMN `month_days` JSON NULL AFTER `then_every_days`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- Step 31 · 20261105_feedback_31_number_requests.sql
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- Step 32 · 20261106_feedback_32_role_access.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 32: who sees which Feedback Desk screens.
--
--   Service Coordinator  + FEEDBACK_VIEW   the Dashboard (calls, read-only) and the Customer report,
--                                           next to Issues, Call schedule and Requests they have.
--   Operations Manager   + FEEDBACK_ADMIN  Masters: Questions, Issues, Templates & settings.
--
-- Permission rows only. Safe to re-run.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_VIEW';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Operations Manager'
  AND p.name = 'FEEDBACK_ADMIN';

-- ---------------------------------------------------------------------------------------------
-- Step 33 · 20261106_feedback_33_part_attachments.sql
-- ---------------------------------------------------------------------------------------------
-- Customer Feedback, step 33: a file attached when a department marks its part of a ticket done.
--
-- feedback_ticket_parts gets attachment_key (the file in MinIO), attachment_name (the file's name)
-- and attachment_type (its content type). One file per department part, optional; e.g. the invoice
-- copy the Accounts Team sent.
--
-- Adds columns only; existing rows keep their values. Safe to re-run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'attachment_key');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts`
     ADD COLUMN `attachment_key` VARCHAR(255) NULL DEFAULT NULL AFTER `done_note`,
     ADD COLUMN `attachment_name` VARCHAR(255) NULL DEFAULT NULL AFTER `attachment_key`,
     ADD COLUMN `attachment_type` VARCHAR(120) NULL DEFAULT NULL AFTER `attachment_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================================
-- Checks - each should return rows / the values shown
-- =============================================================================================
SHOW TABLES LIKE 'feedback%';                                                            -- 18 tables
SELECT kind, with_invoices, is_active FROM feedback_departments;                          -- OPERATIONS, ACCOUNTS ...
SELECT department_kind, COUNT(*) AS issues FROM feedback_issue_types GROUP BY department_kind;
SHOW COLUMNS FROM feedback_tickets LIKE 'action';                                         -- ... 'SITE_AUDIT','SUPERVISOR_VISIT','SALES'
SHOW COLUMNS FROM feedback_tickets LIKE 'priority';                                       -- ... 'VERY_HIGH'
SHOW COLUMNS FROM feedback_requests LIKE 'due_date';                                      -- date, NOT NULL
SHOW INDEX FROM feedback_requests WHERE Key_name = 'uniq_freq_site_due';
SHOW COLUMNS FROM feedback_schedules LIKE 'month_days';
SHOW COLUMNS FROM feedback_ticket_parts LIKE 'attachment%';                               -- attachment_key, attachment_name, attachment_type
SELECT r.name AS role, p.name AS permission FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
  WHERE p.name LIKE 'FEEDBACK%' ORDER BY p.name, r.name;
