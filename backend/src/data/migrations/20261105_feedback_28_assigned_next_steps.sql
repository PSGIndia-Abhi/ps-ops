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
