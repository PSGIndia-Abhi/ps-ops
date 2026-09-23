-- Adds companies.display_name: the name shown to accountants in the frontend,
-- separate from companies.name (the official/production name, and what the
-- invoice-upload matching logic still checks against -- unchanged).
--
-- Backfilled with each row's current name, so nothing goes blank once the
-- frontend starts preferring display_name -- it starts out identical to name
-- and can be edited per customer (directly in the database) whenever the
-- name used in an invoice file differs from the official company name.

ALTER TABLE companies
  ADD COLUMN display_name VARCHAR(255) NULL AFTER name;

UPDATE companies SET display_name = name WHERE display_name IS NULL;
