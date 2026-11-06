-- Sales Field Tracking: "stayed in one place" alerts.
--
-- While a shift runs, a server job (jobs/salesFieldAlerts.cron.js) looks at the GPS points uploaded
-- for it. When the executive has been within STOP_RADIUS_M of one spot for 30+ minutes, is not
-- punched in at a client, and the phone is still sending points, a row is written here and a
-- notification goes to the executive and to the sales managers (everyone with MANAGE_LEADS - the
-- sales manager, the Managing Director and the Personal Assistant). One row per stop: started_at is
-- when they arrived there, so the same stop is never notified twice. The manager's day view on the
-- web lists them.
--
-- New table only - no existing table is changed. Safe to re-run.

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
