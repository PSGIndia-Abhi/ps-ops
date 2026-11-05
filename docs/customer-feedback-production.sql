-- =====================================================================================
-- BestServe - Customer Feedback module: SQL for the PRODUCTION database
-- =====================================================================================
--
-- What this file does
--   Creates the 13 Customer Feedback tables and adds their starting data (questions, WhatsApp
--   and email templates, settings, the 4 FEEDBACK_* permissions and the feedback_collector role).
--   It is the 18 files in backend/src/data/migrations (20261030_feedback_01 ... 20261102_feedback_18)
--   copied unchanged, in the order they must run.
--
--   It only ADDS tables and rows. It does not change or delete any existing table or data.
--   The only ALTER is on the new feedback_tickets table (step 16).
--   Every step is safe to run again (CREATE TABLE IF NOT EXISTS / INSERT IGNORE / NOT EXISTS),
--   so if it stops part-way you can fix the cause and run the whole file again.
--
-- Before you run it
--   1. Take a backup of the production database, for example:
--        mysqldump -u <user> -p --single-transaction --routines --triggers <database> > backup_before_feedback.sql
--   2. Run STEP 0 (read-only checks) and compare with the expected values written there.
--   3. Run the file on the production database:
--        mysql -u <user> -p <database> < docs/customer-feedback-production.sql
--      (or open it in MySQL Workbench / DBeaver on the production database and run all).
--      The mysql client stops at the first error. Do not use --force.
--   4. Check the results of the final VERIFY step.
--
-- After it has run
--   - Deploy the backend and frontend that contain the Customer Feedback module.
--   - Operations Head and Operations Manager get FEEDBACK_VIEW + FEEDBACK_MANAGE here (step 15).
--     Admin can give more (Take calls, Masters) in Admin > Team > Roles & Permissions.
--   - Create the collector users with the role feedback_collector.
--   - For "Book a visit", admin ticks "Create booking" and "View users" for Operations Manager
--     in Roles & Permissions (no SQL needed).
--
-- Needs: MySQL 8.0 or newer and the existing tables users, companies, sites, contacts, jobs,
-- job_visits, roles, permissions and role_permissions.
-- =====================================================================================

SET NAMES utf8mb4;


-- =====================================================================================
-- STEP 0 - read-only checks (change nothing). Expected values are from the tested database.
-- =====================================================================================

-- MySQL version: expected 8.0 or newer (tested on 8.4).
SELECT VERSION() AS mysql_version;

-- sql_mode must NOT contain NO_BACKSLASH_ESCAPES (the template texts use \n for new lines).
SELECT @@SESSION.sql_mode AS sql_mode;

-- The tables the feedback tables point to. Expected:
--   companies.id varchar(20) utf8mb4_0900_ai_ci    sites.id      varchar(20) utf8mb4_0900_ai_ci
--   contacts.id  char(36)    utf8mb4_0900_ai_ci    jobs.id       char(36)    utf8mb4_0900_ai_ci
--   job_visits.id char(36)   utf8mb4_0900_ai_ci    users.id      bigint
--   roles.id int             permissions.id int
-- If a type or collation is different, STOP: the foreign keys would fail. Send me the result.
SELECT table_name, column_name, column_type, collation_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND column_name = 'id'
  AND table_name IN ('users', 'companies', 'sites', 'contacts', 'jobs', 'job_visits', 'roles', 'permissions')
ORDER BY table_name;

-- Expected: 0 rows the first time (no feedback tables yet). If some exist, that is fine:
-- the file skips them.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name LIKE 'feedback\_%'
ORDER BY table_name;

-- The roles that get feedback permissions in step 15 (expected: both exist).
SELECT id, name FROM roles WHERE name IN ('Operations Head', 'Operations Manager', 'feedback_collector');


-- =====================================================================================
-- STEP 1 of 18 - 20261030_feedback_01_questions.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 2 of 18 - 20261030_feedback_02_question_options.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 3 of 18 - 20261030_feedback_03_whatsapp_templates.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 4 of 18 - 20261030_feedback_04_settings.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 5 of 18 - 20261030_feedback_05_requests.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 6 of 18 - 20261030_feedback_06_call_attempts.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 7 of 18 - 20261030_feedback_07_form_links.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 8 of 18 - 20261030_feedback_08_submissions.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 9 of 18 - 20261030_feedback_09_responses.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 10 of 18 - 20261030_feedback_10_tickets.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 11 of 18 - 20261030_feedback_11_whatsapp_messages.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 12 of 18 - 20261030_feedback_12_history.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 13 of 18 - 20261030_feedback_13_seed_questions.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 14 of 18 - 20261030_feedback_14_seed_templates_settings.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 15 of 18 - 20261030_feedback_15_permissions_role.sql
-- =====================================================================================

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


-- =====================================================================================
-- STEP 16 of 18 - 20261031_feedback_16_action_other.sql
-- =====================================================================================

-- Customer Feedback Tickets, step 16: an "Other" next step for a ticket.
--
-- When raising a ticket the collector can choose Other and type what will be done; the text is
-- kept in feedback_tickets.action_note (required for Other). Adds OTHER to the allowed values of
-- feedback_tickets.action only - existing values and rows are unchanged. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `action` ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER') NOT NULL;


-- =====================================================================================
-- STEP 17 of 18 - 20261102_feedback_17_thank_you_whatsapp.sql
-- =====================================================================================

-- Customer Feedback Tickets, step 17: a WhatsApp thank-you for customers with no issue.
--
-- Adds one row to feedback_whatsapp_templates: THANK_YOU, sent to the customer from the call
-- screen when the call ends Good. No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('THANK_YOU', 'Thank you (no issue)',
   'Hello, thank you for your feedback and for choosing BestServe. We are glad you are happy with our service. For any service in future, please contact us. - {collector}, BestServe',
   'CUSTOMER');


-- =====================================================================================
-- STEP 18 of 18 - 20261102_feedback_18_email_templates.sql
-- =====================================================================================

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


-- =====================================================================================
-- VERIFY - read-only checks after the run
-- =====================================================================================

-- Expected: 13 tables.
SELECT COUNT(*) AS feedback_tables FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name LIKE 'feedback\_%';

-- Expected: 5 questions, 13 answers, 4 WhatsApp templates, 3 email templates, 4 settings.
SELECT
  (SELECT COUNT(*) FROM feedback_questions)          AS questions,
  (SELECT COUNT(*) FROM feedback_question_options)   AS answers,
  (SELECT COUNT(*) FROM feedback_whatsapp_templates) AS whatsapp_templates,
  (SELECT COUNT(*) FROM feedback_email_templates)    AS email_templates,
  (SELECT COUNT(*) FROM feedback_settings)           AS settings;

-- Expected: feedback_collector -> FEEDBACK_COLLECT; Operations Head and Operations Manager ->
-- FEEDBACK_VIEW and FEEDBACK_MANAGE.
SELECT r.name AS role, p.name AS permission
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.name LIKE 'FEEDBACK\_%'
ORDER BY r.name, p.name;

-- Expected: ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER')
SELECT column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'feedback_tickets' AND column_name = 'action';

-- ============================== end of file ==============================
