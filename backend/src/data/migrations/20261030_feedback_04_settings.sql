-- Customer Feedback Tickets, step 4 of 15: module settings.
--
-- feedback_settings: one row per setting (key and value), edited by admins.
-- The keys are seeded in step 14.
--
-- New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_settings` (
  `setting_key`   VARCHAR(60)  NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_by`    BIGINT       NULL,
  `updated_at`    DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
