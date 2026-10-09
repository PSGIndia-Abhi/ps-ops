-- Adds "Nth weekday of the month" monthly recurrence (e.g. "every month on
-- the 2nd Saturday"), alongside the existing "day of month" / "last day of
-- month" options.
--
--   month_week  1-4 = First..Fourth occurrence of the weekday that month,
--               -1 = Last occurrence (whichever week that falls in - always
--               correct whether the month has 4 or 5 of that weekday).
--               NULL (default) = this series uses day_of_month / last-day
--               instead, exactly as before.
--
-- The chosen weekday itself is stored in the existing `days_of_week` column
-- (as a single-element array) - no new column needed for it.
--
-- Existing rows are unaffected: month_week stays NULL, so every series
-- created before this migration keeps matching exactly as it did.
-- Safe to re-run: the column is only added if it's missing.

SET @has_month_week := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_task_recurrence' AND COLUMN_NAME = 'month_week'
);
SET @sql := IF(@has_month_week = 0,
  'ALTER TABLE `work_task_recurrence` ADD COLUMN `month_week` TINYINT NULL AFTER `use_last_day_of_month`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
