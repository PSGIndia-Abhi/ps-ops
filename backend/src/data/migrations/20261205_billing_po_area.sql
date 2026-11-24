-- Purchase orders: area (sq. ft / sq. m) on Termite POs.
--
-- A Termite PO can carry the treated area it covers, next to its amount. Like the amount, the area
-- billed on issued invoices carrying the PO is counted against it (Area / Used / Balance); going over
-- only warns on the draft.
--
--   customer_pos.po_area        DECIMAL(14,2) NULL  (NULL = no area on the PO: as before)
--   customer_pos.po_area_unit   VARCHAR(10)   NULL  ('sq.ft' or 'sq.m': the unit the area is in)
--
-- New optional columns only; every existing PO gets NULL, so nothing existing changes.
-- Run once. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left panel first (or
-- keep the USE line).

USE ps_ops;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_area DECIMAL(14,2) NULL DEFAULT NULL AFTER po_amount',
  'SELECT ''customer_pos.po_area already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_pos' AND COLUMN_NAME = 'po_area_unit');
SET @sql := IF(@has = 0,
  'ALTER TABLE customer_pos ADD COLUMN po_area_unit VARCHAR(10) NULL DEFAULT NULL AFTER po_area',
  'SELECT ''customer_pos.po_area_unit already exists'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
