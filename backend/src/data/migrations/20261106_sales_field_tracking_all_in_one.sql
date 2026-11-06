-- =================================================================================================
-- Sales Field Tracking (live tracking) - ALL database changes in one file.
--
-- Same as running these three files in order:
--   20261027_create_sales_field_tracking_tables.sql   (shifts + GPS points)
--   20261028_create_sales_field_day_routes.sql        (saved petrol km + road line per day)
--   20261106_create_sales_field_alerts.sql            ("stayed 30+ min at one place" alerts)
--
-- Only NEW tables - no existing table is changed. Safe to run more than once.
-- No new permissions are needed (the pages use the existing CRM_VIEW_LEAD / MANAGE_LEADS).
--
-- Run on the ps_ops database, for example:
--   docker exec -i ps-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ps_ops' < 20261106_sales_field_tracking_all_in_one.sql
-- =================================================================================================


-- 1. Shifts: one row per started field day (an executive may end and start again the same day).
--    ACTIVE while open; ENDED by the executive; AUTO_ENDED by the nightly job (forgotten shift).
CREATE TABLE IF NOT EXISTS `sales_field_shifts` (
  `id`              CHAR(36)      NOT NULL,
  `user_id`         BIGINT        NOT NULL,
  `started_at`      DATETIME      NOT NULL,
  `start_latitude`  DECIMAL(10,7) NULL,
  `start_longitude` DECIMAL(10,7) NULL,
  `ended_at`        DATETIME      NULL,
  `end_latitude`    DECIMAL(10,7) NULL,
  `end_longitude`   DECIMAL(10,7) NULL,
  `status`          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
  `created_at`      TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sfs_user_started` (`user_id`, `started_at`),
  KEY `idx_sfs_status` (`status`),
  CONSTRAINT `fk_sfs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 2. GPS points uploaded by the phone. client_point_id is made on the phone, so a batch uploaded
--    twice (retry after a network drop) is stored once.
CREATE TABLE IF NOT EXISTS `sales_field_points` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `shift_id`        CHAR(36)      NOT NULL,
  `user_id`         BIGINT        NOT NULL,
  `client_point_id` VARCHAR(64)   NOT NULL,
  `captured_at`     DATETIME      NOT NULL,
  `latitude`        DECIMAL(10,7) NOT NULL,
  `longitude`       DECIMAL(10,7) NOT NULL,
  `accuracy_m`      DECIMAL(8,2)  NULL,
  `speed_kmph`      DECIMAL(8,2)  NULL,
  `bearing`         DECIMAL(6,2)  NULL,
  `battery_percent` TINYINT       NULL,
  `created_at`      TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sfp_client_point` (`user_id`, `client_point_id`),
  KEY `idx_sfp_shift_time` (`shift_id`, `captured_at`),
  KEY `idx_sfp_user_time` (`user_id`, `captured_at`),
  CONSTRAINT `fk_sfp_shift` FOREIGN KEY (`shift_id`) REFERENCES `sales_field_shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sfp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 3. Petrol km and road line of a closed day, worked out once (Google asked only the first time a
--    manager opens the day). fingerprint changes when late points arrive, so it is worked out again.
CREATE TABLE IF NOT EXISTS `sales_field_day_routes` (
  `user_id`       BIGINT        NOT NULL,
  `work_date`     DATE          NOT NULL,
  `fingerprint`   CHAR(40)      NOT NULL,
  `petrol_km`     DECIMAL(10,2) NULL,
  `leg_road_m`    JSON          NULL,
  `road_path`     MEDIUMTEXT    NULL,
  `computed_by`   BIGINT        NULL,
  `computed_at`   TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `work_date`),
  CONSTRAINT `fk_sfdr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Safety: if an older copy of sales_field_day_routes was created before leg_road_m existed, add it.
-- (Does nothing when the column is already there.)
SET @has_leg := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'sales_field_day_routes' AND column_name = 'leg_road_m');
SET @sql := IF(@has_leg = 0, 'ALTER TABLE `sales_field_day_routes` ADD COLUMN `leg_road_m` JSON NULL AFTER `petrol_km`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 4. "Stayed in one place for 30+ min" alerts (server job every 5 min). One row per stop, so the
--    executive and the managers are notified only once for the same stop.
CREATE TABLE IF NOT EXISTS `sales_field_alerts` (
  `id`           CHAR(36)      NOT NULL,
  `shift_id`     CHAR(36)      NOT NULL,
  `user_id`      BIGINT        NOT NULL,
  `kind`         VARCHAR(20)   NOT NULL DEFAULT 'LONG_STOP',
  `started_at`   DATETIME      NOT NULL,
  `minutes`      INT           NOT NULL,
  `latitude`     DECIMAL(10,7) NOT NULL,
  `longitude`    DECIMAL(10,7) NOT NULL,
  `notified_at`  TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sfa_stop` (`shift_id`, `kind`, `started_at`),
  KEY `idx_sfa_user_time` (`user_id`, `started_at`),
  CONSTRAINT `fk_sfa_shift` FOREIGN KEY (`shift_id`) REFERENCES `sales_field_shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sfa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- 5. Check: should list the 4 tables.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name LIKE 'sales\_field\_%'
 ORDER BY table_name;
