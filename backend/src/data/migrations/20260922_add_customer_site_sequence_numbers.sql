-- Adds a simple, human-friendly, auto-incrementing reference number to
-- companies (customers) and sites, alongside their existing CHAR(36) UUID
-- primary keys.
--
-- The UUID `id` columns remain the real primary/foreign keys everywhere
-- (invoices, payments, TDS, tasks, sites, bookings, jobs, contacts, auth
-- scope checks, ...) so nothing that already depends on them changes.
-- These new columns are purely additive: a short number you can look up,
-- display, or search by, without touching any existing relationship.

ALTER TABLE companies
  ADD COLUMN customer_no INT NULL AUTO_INCREMENT UNIQUE AFTER id;

ALTER TABLE sites
  ADD COLUMN site_no INT NULL AUTO_INCREMENT UNIQUE AFTER id;
