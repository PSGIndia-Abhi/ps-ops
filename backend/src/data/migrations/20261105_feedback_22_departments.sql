-- Customer Feedback Tickets, step 22: the departments a ticket can go to.
--
-- feedback_departments: which org departments (org_units, admin > Departments) take feedback tickets,
-- and what kind of work each one does on a ticket:
--   OPERATIONS  the existing flow - the issue, the visit it is about and a re-visit booked in Jobs
--   ACCOUNTS    an invoice-related issue: its summary, priority and the customer's invoice(s)
-- The admin switches a department on or off in Feedback > Masters > Settings. People of an active
-- department (user_org_units) get the Feedback app next to Task Management, and see only the tickets
-- that have a part for their department.
--
-- Starts with the departments named 'Operations Team' and 'Accounts Team' when they exist; the admin
-- can point either kind at another department later. New table only. Safe to re-run.

CREATE TABLE IF NOT EXISTS `feedback_departments` (
  `kind`         ENUM('OPERATIONS','ACCOUNTS') NOT NULL,
  `org_unit_id`  CHAR(36)   NOT NULL,
  `is_active`    TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`   INT        NOT NULL DEFAULT 0,
  `updated_by`   BIGINT     NULL,
  `created_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`),
  UNIQUE KEY `uniq_fd_org_unit` (`org_unit_id`),
  CONSTRAINT `fk_fd_org_unit` FOREIGN KEY (`org_unit_id`) REFERENCES `org_units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'OPERATIONS', u.id, 1, 1 FROM `org_units` u
WHERE u.name = 'Operations Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;

INSERT IGNORE INTO `feedback_departments` (`kind`, `org_unit_id`, `is_active`, `sort_order`)
SELECT 'ACCOUNTS', u.id, 1, 2 FROM `org_units` u
WHERE u.name = 'Accounts Team' AND u.is_active = 1
ORDER BY u.created_at LIMIT 1;
