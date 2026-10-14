-- The accountant's own phone list for a customer: who to call about payments.
--
-- Kept apart from `contacts` on purpose. `contacts` is the admin's list (linked
-- to a site, shown on the admin Contacts page, used for client logins); numbers
-- saved here never appear there, and nothing here needs a site -- a row is
-- linked straight to the customer (`companies.id`).
--
-- A customer can have several numbers; at most one is primary (the one the
-- "Call Customer" button dials). That is enforced in code: saving a contact as
-- primary clears the mark on the customer's other rows in the same transaction.
-- Rows are never hard-deleted (is_active = 0 hides one).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS `customer_payment_contacts` (
  `id` CHAR(36) NOT NULL,
  `customer_id` VARCHAR(20) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(150) NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT NULL,
  `updated_by` BIGINT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cpc_customer` (`customer_id`, `is_active`),
  CONSTRAINT `fk_cpc_customer` FOREIGN KEY (`customer_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
