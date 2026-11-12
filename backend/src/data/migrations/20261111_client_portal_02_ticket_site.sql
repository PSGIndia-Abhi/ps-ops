-- Client Portal complaints: a complaint (job_tickets row) can belong to an outlet directly.
--
--   job_tickets.site_id  the outlet (sites.id) the complaint is about. NULL for older tickets
--                        and for staff tickets; those keep working through job_ticket_links.
--
-- Staff see a site complaint in Admin > Tickets when the outlet is in their branch.
-- Existing rows are unchanged. Safe to re-run: the column and index are only added if missing.

SET @has_site_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND COLUMN_NAME = 'site_id'
);
SET @sql := IF(@has_site_id = 0,
  'ALTER TABLE `job_tickets` ADD COLUMN `site_id` VARCHAR(20) NULL AFTER `priority`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_site_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_tickets' AND INDEX_NAME = 'idx_job_tickets_site'
);
SET @sql := IF(@has_site_idx = 0,
  'ALTER TABLE `job_tickets` ADD INDEX `idx_job_tickets_site` (`site_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
