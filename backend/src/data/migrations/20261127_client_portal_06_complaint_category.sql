-- Client Portal complaints: what the complaint is about, chosen by the client when raising it.
--
--   job_tickets.category   'SERVICE', 'ACCOUNTS' or 'SERVICE,ACCOUNTS' (both)
--                          NULL = older complaints / tickets raised elsewhere (shown as Service)
--
-- Adds one nullable column; no data is changed. Safe to re-run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND COLUMN_NAME = 'category');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `job_tickets` ADD COLUMN `category` VARCHAR(30) NULL AFTER `priority`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
