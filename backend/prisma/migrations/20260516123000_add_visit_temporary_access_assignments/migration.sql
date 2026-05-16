CREATE TABLE IF NOT EXISTS `visit_temporary_access` (
  `id` CHAR(36) NOT NULL,
  `visit_id` CHAR(36) NOT NULL,
  `temp_access_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_visit_temp_access` (`visit_id`, `temp_access_id`),
  KEY `idx_visit_temp_access_visit` (`visit_id`),
  KEY `idx_visit_temp_access_temp` (`temp_access_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Match FK column collations with parent columns exactly (works across environments).
SET @visit_id_collation := (
  SELECT COLLATION_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'job_visits'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);
SET @temp_access_id_collation := (
  SELECT COLLATION_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'temporary_access'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);
SET @sql_align_cols := CONCAT(
  'ALTER TABLE `visit_temporary_access` ',
  'MODIFY `visit_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE ', @visit_id_collation, ' NOT NULL, ',
  'MODIFY `temp_access_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE ', @temp_access_id_collation, ' NOT NULL'
);
PREPARE stmt_align_cols FROM @sql_align_cols;
EXECUTE stmt_align_cols;
DEALLOCATE PREPARE stmt_align_cols;

SET @has_fk_visit := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'visit_temporary_access'
    AND CONSTRAINT_NAME = 'fk_visit_temp_access_visit'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_visit := IF(
  @has_fk_visit = 0,
  'ALTER TABLE `visit_temporary_access` ADD CONSTRAINT `fk_visit_temp_access_visit` FOREIGN KEY (`visit_id`) REFERENCES `job_visits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_fk_visit FROM @sql_fk_visit;
EXECUTE stmt_fk_visit;
DEALLOCATE PREPARE stmt_fk_visit;

SET @has_fk_temp := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'visit_temporary_access'
    AND CONSTRAINT_NAME = 'fk_visit_temp_access_temp_access'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_temp := IF(
  @has_fk_temp = 0,
  'ALTER TABLE `visit_temporary_access` ADD CONSTRAINT `fk_visit_temp_access_temp_access` FOREIGN KEY (`temp_access_id`) REFERENCES `temporary_access`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_fk_temp FROM @sql_fk_temp;
EXECUTE stmt_fk_temp;
DEALLOCATE PREPARE stmt_fk_temp;
