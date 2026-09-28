-- Generic Task Management module: 6 new tables, all prefixed work_task.
-- Fully separate from the Accountant module's existing `tasks` /
-- `task_reminders` tables, which are not touched.
-- Tables are created parent-first so the foreign keys resolve.

CREATE TABLE IF NOT EXISTS `work_task_series` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `task_type` VARCHAR(100) NULL,
  `priority` ENUM('LOW','NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
  `source_module` VARCHAR(50) NULL,
  `source_id` VARCHAR(64) NULL,
  `assigned_to` BIGINT NOT NULL,
  `status` ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `pause_from` DATE NULL,
  `pause_until` DATE NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_wts_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `work_task_recurrence` (
  `id` CHAR(36) NOT NULL,
  `series_id` CHAR(36) NOT NULL,
  `frequency` ENUM('DAILY','WEEKLY','MONTHLY','YEARLY') NOT NULL,
  `interval_value` INT NOT NULL DEFAULT 1,
  `days_of_week` JSON NULL,
  `day_of_month` INT NULL,
  `use_last_day_of_month` TINYINT(1) NOT NULL DEFAULT 0,
  `month_of_year` INT NULL,
  `time_of_day` TIME NOT NULL DEFAULT '09:00:00',
  `start_date` DATE NOT NULL,
  `end_type` ENUM('NEVER','ON_DATE','AFTER_COUNT') NOT NULL DEFAULT 'NEVER',
  `end_date` DATE NULL,
  `end_count` INT NULL,
  `occurrences_created` INT NOT NULL DEFAULT 0,
  `last_generated_until` DATE NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_wtr_series` (`series_id`),
  CONSTRAINT `fk_wtr_series` FOREIGN KEY (`series_id`) REFERENCES `work_task_series` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `work_tasks` (
  `id` CHAR(36) NOT NULL,
  `series_id` CHAR(36) NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `task_type` VARCHAR(100) NULL,
  `priority` ENUM('LOW','NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
  `status` ENUM('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `source_module` VARCHAR(50) NULL,
  `source_id` VARCHAR(64) NULL,
  `assigned_to` BIGINT NOT NULL,
  `created_by` BIGINT NULL,
  `due_date` DATE NOT NULL,
  `due_time` TIME NULL,
  `next_action` VARCHAR(255) NULL,
  `next_action_date` DATE NULL,
  `started_at` DATETIME NULL,
  `started_by` BIGINT NULL,
  `completed_at` DATETIME NULL,
  `completed_by` BIGINT NULL,
  `completion_note` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wt_assigned` (`assigned_to`, `status`),
  KEY `idx_wt_series` (`series_id`),
  KEY `idx_wt_due` (`due_date`),
  KEY `idx_wt_source` (`source_module`, `source_id`),
  CONSTRAINT `fk_wt_series` FOREIGN KEY (`series_id`) REFERENCES `work_task_series` (`id`),
  CONSTRAINT `fk_wt_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wt_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wt_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wt_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `work_task_comments` (
  `id` CHAR(36) NOT NULL,
  `task_id` CHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wtc_task` (`task_id`),
  CONSTRAINT `fk_wtc_task` FOREIGN KEY (`task_id`) REFERENCES `work_tasks` (`id`),
  CONSTRAINT `fk_wtc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `work_task_attachments` (
  `id` CHAR(36) NOT NULL,
  `task_id` CHAR(36) NOT NULL,
  `object_key` VARCHAR(500) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(100) NULL,
  `file_size` INT NULL,
  `uploaded_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wta_task` (`task_id`),
  CONSTRAINT `fk_wta_task` FOREIGN KEY (`task_id`) REFERENCES `work_tasks` (`id`),
  CONSTRAINT `fk_wta_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `work_task_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` CHAR(36) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `from_status` VARCHAR(20) NULL,
  `to_status` VARCHAR(20) NULL,
  `note` VARCHAR(500) NULL,
  `changed_by` BIGINT NULL,
  `changed_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wth_task` (`task_id`),
  CONSTRAINT `fk_wth_task` FOREIGN KEY (`task_id`) REFERENCES `work_tasks` (`id`),
  CONSTRAINT `fk_wth_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
