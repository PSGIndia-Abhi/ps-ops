-- Org hierarchy: configurable departments/teams (org_units), people's home
-- unit (user_org_units), who-reports-to-whom (user_reporting_lines), the
-- admin-managed title list (designations), and an audit log of every change.
--
-- Design notes (agreed in the hierarchy proposal):
--  * Nothing about the structure is hardcoded — unit names, depth, unit_type
--    labels and designations are all rows an admin edits.
--  * A person can have SEVERAL managers (one row per manager in
--    user_reporting_lines). is_primary only picks which line the org chart
--    draws; every active line grants visibility.
--  * Reporting loops (e.g. Operation Head <-> Quality Head) are allowed, so
--    anything walking the lines must use UNION (not UNION ALL) and must not
--    select a depth column, or the recursive query will not terminate.
--  * MySQL has no partial unique index, so "one primary line/unit per user"
--    and "no duplicate active line" are enforced by the API, not here.
--  * New ids are char(36) UUIDs like sites/companies/branches; user columns
--    are BIGINT to match users.id.
--  * Rows are soft-deleted via is_active / effective_to, never hard-deleted.

CREATE TABLE IF NOT EXISTS `designations` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_designations_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `org_units` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `parent_id` CHAR(36) NULL,
  `unit_type` VARCHAR(50) NULL,
  `branch_id` CHAR(36) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_org_units_parent_name` (`parent_id`, `name`),
  KEY `idx_org_units_parent` (`parent_id`),
  KEY `idx_org_units_branch` (`branch_id`),
  CONSTRAINT `fk_org_units_parent` FOREIGN KEY (`parent_id`) REFERENCES `org_units` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_org_units_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_org_units` (
  `id` CHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `org_unit_id` CHAR(36) NOT NULL,
  `designation_id` CHAR(36) NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `is_head` TINYINT(1) NOT NULL DEFAULT 0,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uou_user` (`user_id`, `effective_to`),
  KEY `idx_uou_unit` (`org_unit_id`, `effective_to`),
  KEY `idx_uou_designation` (`designation_id`),
  CONSTRAINT `fk_uou_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_uou_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_units` (`id`),
  CONSTRAINT `fk_uou_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`id`),
  CONSTRAINT `chk_uou_dates` CHECK (`effective_to` IS NULL OR `effective_to` >= `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_reporting_lines` (
  `id` CHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `manager_user_id` BIGINT NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_url_user_manager_from` (`user_id`, `manager_user_id`, `effective_from`),
  KEY `idx_url_manager` (`manager_user_id`, `effective_to`),
  KEY `idx_url_user` (`user_id`, `effective_to`),
  CONSTRAINT `fk_url_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_url_manager` FOREIGN KEY (`manager_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_url_not_self` CHECK (`user_id` <> `manager_user_id`),
  CONSTRAINT `chk_url_dates` CHECK (`effective_to` IS NULL OR `effective_to` >= `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- No FK on changed_by on purpose: the log must survive even if a user is
-- later removed.
CREATE TABLE IF NOT EXISTS `hierarchy_audit_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entity_type` VARCHAR(30) NOT NULL,
  `entity_id` VARCHAR(36) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `old_value` JSON NULL,
  `new_value` JSON NULL,
  `changed_by` BIGINT NULL,
  `changed_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hal_entity` (`entity_type`, `entity_id`),
  KEY `idx_hal_changed_at` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
