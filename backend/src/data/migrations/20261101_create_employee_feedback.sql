-- Employee feedback (Task Management): the Managing Director's private notes on their employees -
-- a free type ("Punctuality", "Customer handling"...), what they have to say, and 1-5 stars. Seen
-- only by the Managing Director. Kept per employee (users.id), ready to be attached to an HRMS later.
--
-- Additive only: one new table. No existing table is changed. Safe to run more than once.

CREATE TABLE IF NOT EXISTS `employee_feedback` (
  `id` CHAR(36) NOT NULL,
  `employee_id` BIGINT NOT NULL,
  `feedback_type` VARCHAR(100) NOT NULL,
  `comments` TEXT NOT NULL,
  `rating` TINYINT NOT NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ef_employee` (`employee_id`, `created_at`),
  KEY `idx_ef_type` (`feedback_type`),
  CONSTRAINT `fk_ef_employee` FOREIGN KEY (`employee_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ef_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_ef_rating` CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
