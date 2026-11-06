-- Customer Feedback, step 33: a file attached when a department marks its part of a ticket done.
--
-- feedback_ticket_parts gets attachment_key (the file in MinIO), attachment_name (the file's name)
-- and attachment_type (its content type). One file per department part, optional; e.g. the invoice
-- copy the Accounts Team sent.
--
-- Adds columns only; existing rows keep their values. Safe to re-run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_ticket_parts' AND COLUMN_NAME = 'attachment_key');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `feedback_ticket_parts`
     ADD COLUMN `attachment_key` VARCHAR(255) NULL DEFAULT NULL AFTER `done_note`,
     ADD COLUMN `attachment_name` VARCHAR(255) NULL DEFAULT NULL AFTER `attachment_key`,
     ADD COLUMN `attachment_type` VARCHAR(120) NULL DEFAULT NULL AFTER `attachment_name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
