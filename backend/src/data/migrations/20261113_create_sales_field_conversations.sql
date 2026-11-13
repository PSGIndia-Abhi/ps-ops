-- Sales Field Tracking: "just a conversation" visits.
--
-- During a field day (shift) the sales executive may talk to someone who is not a lead (a
-- passer-by, a contractor, a shop owner...). The Android app's Unplanned visit -> Just conversation
-- records who they met, what was discussed, and where/when - against the active shift, with no lead.
-- The sales manager sees these in Field Tracking -> the executive's day.
--
-- Not a client stop: conversations are NOT counted in petrol km / route legs.
-- New table only - no existing table is changed. Safe to run more than once.
--
-- Run on the ps_ops database, for example:
--   docker exec -i ps-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ps_ops' < 20261113_create_sales_field_conversations.sql

CREATE TABLE IF NOT EXISTS `sales_field_conversations` (
  `id`           CHAR(36)      NOT NULL,
  `shift_id`     CHAR(36)      NOT NULL,
  `user_id`      BIGINT        NOT NULL,
  `person_name`  VARCHAR(150)  NOT NULL,
  `notes`        TEXT          NOT NULL,
  `latitude`     DECIMAL(10,7) NULL,
  `longitude`    DECIMAL(10,7) NULL,
  `created_at`   DATETIME      NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sfc_shift` (`shift_id`),
  KEY `idx_sfc_user_time` (`user_id`, `created_at`),
  CONSTRAINT `fk_sfc_shift` FOREIGN KEY (`shift_id`) REFERENCES `sales_field_shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sfc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
