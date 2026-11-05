-- Customer Feedback, step 26: each department's issue types (Feedback Desk > Issues).
--
-- feedback_issue_types: the issues a ticket can raise for a department (feedback_departments.kind),
-- e.g. Operations: Services, Technicians, Grooming, Behaviour. When raising a ticket the collector
-- ticks one or more issues of each chosen department and types the details for each.
-- is_service = 1: the "Services" issue of Operations - it shows the month's services to pick (the
-- visit and technician go on the ticket) instead of a text box.
-- feedback_ticket_parts.issues: the issues ticked on that part, as
-- [{ "id": 3, "name": "Grooming", "text": "Technician came without uniform" }].
--
-- New permission FEEDBACK_ISSUES (manage departments and issue types), given to the Service
-- Coordinator role. Admin passes every check in code.
--
-- New table, a new column and permission rows only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_issue_types` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `department_kind`  VARCHAR(40)  NOT NULL,
  `name`             VARCHAR(100) NOT NULL,
  `is_service`       TINYINT(1)   NOT NULL DEFAULT 0,
  `sort_order`       INT          NOT NULL DEFAULT 0,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_by`       BIGINT       NULL,
  `updated_by`       BIGINT       NULL,
  `created_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fit_dept_name` (`department_kind`, `name`),
  KEY `idx_fit_dept` (`department_kind`, `is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Starting issues (the admin / service coordinator edit them later).
INSERT IGNORE INTO `feedback_issue_types` (`department_kind`, `name`, `is_service`, `sort_order`) VALUES
  ('OPERATIONS', 'Services',   1, 1),
  ('OPERATIONS', 'Technicians', 0, 2),
  ('OPERATIONS', 'Grooming',   0, 3),
  ('OPERATIONS', 'Behaviour',  0, 4),
  ('ACCOUNTS',   'Invoice not received', 0, 1),
  ('ACCOUNTS',   'Wrong invoice amount', 0, 2),
  ('ACCOUNTS',   'Payment not updated',  0, 3),
  ('ACCOUNTS',   'GST / billing details', 0, 4);

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'issues');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts` ADD COLUMN `issues` JSON NULL AFTER `issue_summary`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_ISSUES' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_ISSUES');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'Service Coordinator'
  AND p.name = 'FEEDBACK_ISSUES';
