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
