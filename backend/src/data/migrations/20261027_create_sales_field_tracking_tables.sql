-- Sales Executive Field Tracking (Lead Management -> Field Tracking).
--
-- A sales executive starts a field day (shift) in the Android app, punches in/out at clients
-- (crm_lead_meetings check-in/out, unchanged), and ends the day. While the shift is open the app
-- records GPS points in the background and uploads them in batches. The sales manager reviews the
-- day afterwards on the web: route map, punches vs. lead locations, and petrol km
-- (home -> each client -> home, always counted from the registered home location).
--
-- sales_home_locations: one row per executive, set by admin. The base point for petrol km.
-- sales_field_shifts:   one row per started field day (an executive may end and start again).
-- sales_field_points:   background GPS points. client_point_id is generated on the phone so a
--                       batch that is uploaded twice (retry after a network drop) is stored once.
--
-- Separate from technician_shifts / technician_location_history on purpose: technician tracking
-- is untouched. New tables only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `sales_home_locations` (
  `user_id`    BIGINT        NOT NULL,
  `latitude`   DECIMAL(10,7) NOT NULL,
  `longitude`  DECIMAL(10,7) NOT NULL,
  `address`    VARCHAR(255)  NULL,
  `updated_by` BIGINT        NULL,
  `created_at` TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_shl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sales_field_shifts` (
  `id`              CHAR(36)      NOT NULL,
  `user_id`         BIGINT        NOT NULL,
  `started_at`      DATETIME      NOT NULL,
  `start_latitude`  DECIMAL(10,7) NULL,
  `start_longitude` DECIMAL(10,7) NULL,
  `ended_at`        DATETIME      NULL,
  `end_latitude`    DECIMAL(10,7) NULL,
  `end_longitude`   DECIMAL(10,7) NULL,
  -- ACTIVE while open; ENDED by the executive; AUTO_ENDED by the nightly job (forgotten shift).
  `status`          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
  `created_at`      TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sfs_user_started` (`user_id`, `started_at`),
  KEY `idx_sfs_status` (`status`),
  CONSTRAINT `fk_sfs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
