-- Payment Tracking module: invoices, payments, payment allocations,
-- generic tasks/reminders, and the Excel bulk-invoice-import pipeline.
--
-- customer_id/site_id below reference the EXISTING companies/sites tables
-- (CHAR(36) UUID primary keys) rather than introducing a separate
-- "customer" table. created_by/updated_by/assigned_to reference the
-- EXISTING users table, whose primary key is BIGINT, not CHAR(36).

CREATE TABLE IF NOT EXISTS invoices (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  invoice_number VARCHAR(100) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  site_id CHAR(36) NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  invoice_amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status ENUM('PENDING','PARTIAL','PAID','OVERDUE','CANCELLED') NOT NULL DEFAULT 'PENDING',
  invoice_file_name VARCHAR(255) NULL,
  invoice_file_path VARCHAR(500) NULL,
  remarks VARCHAR(1000) NULL,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT NULL,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_invoices_customer_number (customer_id, invoice_number),
  INDEX idx_invoices_customer (customer_id),
  INDEX idx_invoices_site (site_id),
  INDEX idx_invoices_status (status),
  INDEX idx_invoices_due_date (due_date),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES companies(id),
  CONSTRAINT fk_invoices_site FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_invoices_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  payment_number VARCHAR(50) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  payment_date DATE NOT NULL,
  received_amount DECIMAL(15,2) NOT NULL,
  payment_mode ENUM('CASH','UPI','BANK_TRANSFER','NEFT','CHEQUE','CARD','OTHER') NOT NULL,
  reference_number VARCHAR(100) NULL,
  remarks VARCHAR(1000) NULL,
  status ENUM('POSTED','CANCELLED') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT NULL,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_payments_number (payment_number),
  INDEX idx_payments_customer (customer_id),
  INDEX idx_payments_date (payment_date),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES companies(id),
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_payments_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  payment_id CHAR(36) NOT NULL,
  invoice_id CHAR(36) NOT NULL,
  allocated_amount DECIMAL(15,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_payment_invoice (payment_id, invoice_id),
  INDEX idx_alloc_payment (payment_id),
  INDEX idx_alloc_invoice (invoice_id),
  CONSTRAINT fk_alloc_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_alloc_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Generic task, reusable beyond invoices (reference_type/reference_id) —
-- e.g. JOB_CARD later, per the original requirement. Upcoming/Due
-- Today/Overdue are derived from due_date at query time (the same
-- pattern jobs.status uses for its own display_status), not stored,
-- so a task doesn't need updating just because a day passed.
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  reference_type ENUM('INVOICE','JOB_CARD') NOT NULL,
  reference_id CHAR(36) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  notes VARCHAR(2000) NULL,
  priority ENUM('LOW','NORMAL','HIGH') NOT NULL DEFAULT 'NORMAL',
  status ENUM('OPEN','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  assigned_to BIGINT NULL,
  due_date DATE NULL,
  due_time TIME NULL,
  completed_at DATETIME NULL,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_reference (reference_type, reference_id),
  INDEX idx_tasks_assigned (assigned_to),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS task_reminders (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  task_id CHAR(36) NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time TIME NOT NULL,
  notes VARCHAR(1000) NULL,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reminders_task (task_id),
  INDEX idx_reminders_date (reminder_date),
  CONSTRAINT fk_reminders_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_reminders_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Bulk Excel invoice import: staging rows are validated/matched to a
-- customer+site before any row becomes a real invoice, so a bad file
-- never partially corrupts the invoices table.
CREATE TABLE IF NOT EXISTS invoice_imports (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NULL,
  status ENUM('UPLOADED','PREVIEWED','CONFIRMED','FAILED') NOT NULL DEFAULT 'UPLOADED',
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_invoice_imports_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoice_import_rows (
  id CHAR(36) NOT NULL DEFAULT (uuid()),
  import_id CHAR(36) NOT NULL,
  `row_number` INT NOT NULL,
  raw_data JSON NOT NULL,
  customer_name VARCHAR(255) NULL,
  matched_customer_id CHAR(36) NULL,
  site_name VARCHAR(255) NULL,
  matched_site_id CHAR(36) NULL,
  invoice_number VARCHAR(100) NULL,
  invoice_date DATE NULL,
  due_date DATE NULL,
  invoice_amount DECIMAL(15,2) NULL,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  error_message VARCHAR(500) NULL,
  created_invoice_id CHAR(36) NULL,
  PRIMARY KEY (id),
  INDEX idx_import_rows_import (import_id),
  CONSTRAINT fk_import_rows_import FOREIGN KEY (import_id) REFERENCES invoice_imports(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_rows_customer FOREIGN KEY (matched_customer_id) REFERENCES companies(id),
  CONSTRAINT fk_import_rows_site FOREIGN KEY (matched_site_id) REFERENCES sites(id),
  CONSTRAINT fk_import_rows_invoice FOREIGN KEY (created_invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Register the new permission names so they appear in the Roles UI
-- (Team Management > Roles) for future assignment to non-admin roles.
-- `admin` already bypasses permission checks entirely and needs no row
-- here. `permissions.name` has no UNIQUE constraint, hence the guarded
-- INSERT...SELECT so re-running this file is harmless.
INSERT INTO permissions (name)
SELECT * FROM (SELECT 'VIEW_INVOICE' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'VIEW_INVOICE');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'CREATE_INVOICE' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CREATE_INVOICE');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'UPDATE_INVOICE' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'UPDATE_INVOICE');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'CANCEL_INVOICE' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CANCEL_INVOICE');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'VIEW_PAYMENT' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'VIEW_PAYMENT');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'CREATE_PAYMENT' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CREATE_PAYMENT');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'VIEW_TASK' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'VIEW_TASK');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'CREATE_TASK' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'CREATE_TASK');

INSERT INTO permissions (name)
SELECT * FROM (SELECT 'UPDATE_TASK' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'UPDATE_TASK');
