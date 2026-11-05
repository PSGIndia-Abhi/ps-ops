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
