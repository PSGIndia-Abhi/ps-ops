-- Pause / resume for the generic Task Management module.
--
-- The assignee can pause a task they've started (with a reason) and resume
-- it later:  IN_PROGRESS -> PAUSED -> IN_PROGRESS. A paused task has to be
-- resumed before it can be completed.
--
--   status          gains 'PAUSED'.
--   paused_at       when the current pause began (NULL unless PAUSED).
--   paused_seconds  total time spent paused so far, so "time worked" can be
--                   shown as (now - started_at - paused_seconds).
--
-- Existing rows are unchanged. Safe to re-run: the ENUM change is idempotent
-- and each column is only added if it's missing.

ALTER TABLE `work_tasks`
  MODIFY `status` ENUM('OPEN','IN_PROGRESS','PAUSED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN';

SET @has_paused_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_tasks' AND COLUMN_NAME = 'paused_at'
);
SET @sql := IF(@has_paused_at = 0,
  'ALTER TABLE `work_tasks` ADD COLUMN `paused_at` DATETIME NULL AFTER `started_by`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_paused_seconds := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_tasks' AND COLUMN_NAME = 'paused_seconds'
);
SET @sql := IF(@has_paused_seconds = 0,
  'ALTER TABLE `work_tasks` ADD COLUMN `paused_seconds` INT NOT NULL DEFAULT 0 AFTER `paused_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
