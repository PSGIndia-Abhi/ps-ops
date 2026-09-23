-- Adds the missing created/modified audit columns to the accountant/payment-
-- tracking/TDS tables, so every one of them has created_at, created_by,
-- updated_at and updated_by, matching the convention already used on
-- invoices and payments. Purely additive: no existing column, row, value or
-- FK is changed. Naming follows the existing fk_<table>_<column> pattern.

ALTER TABLE payment_allocations
  ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_payment_allocations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE tasks
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_tasks_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE task_reminders
  ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_task_reminders_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE tds_transactions
  ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_tds_transactions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE invoice_imports
  ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_invoice_imports_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE invoice_import_rows
  ADD COLUMN created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN created_by bigint DEFAULT NULL,
  ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN updated_by bigint DEFAULT NULL,
  ADD CONSTRAINT fk_invoice_import_rows_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT fk_invoice_import_rows_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE invoice_tds
  ADD COLUMN created_by bigint DEFAULT NULL AFTER created_at,
  ADD COLUMN updated_by bigint DEFAULT NULL AFTER updated_at,
  ADD CONSTRAINT fk_invoice_tds_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT fk_invoice_tds_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);
