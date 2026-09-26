-- Purely additive: 3 extra columns on user_hierarchy to mirror the fields
-- named in the reference Task Management design doc (hierarchy_level,
-- status, updated_at). No backend query selects, sets, or reads any of
-- these -- they stay NULL/default forever unless code is deliberately
-- wired up later to use them. Existing INSERT/UPDATE statements are
-- unaffected since none of them name these columns.
--
-- Left out on purpose (unchanged from the working design):
--  * hierarchy_level would assume a strict tree; this app allows
--    intentional reporting loops (e.g. Operation Head <-> Quality Head),
--    so it is added here as a dormant, always-NULL column only -- nothing
--    computes or relies on it.
--  * status duplicates what effective_to already expresses (NULL = active,
--    dated = ended); added here as dormant only, default 'ACTIVE', never
--    read or updated by the app.
--  * updated_at has no ON UPDATE CURRENT_TIMESTAMP, so it never changes on
--    its own -- stays NULL unless something explicitly sets it later.

ALTER TABLE `user_hierarchy`
  ADD COLUMN `hierarchy_level` INT NULL AFTER `manager_user_id`,
  ADD COLUMN `status` VARCHAR(20) NULL DEFAULT 'ACTIVE' AFTER `effective_to`,
  ADD COLUMN `updated_at` DATETIME NULL DEFAULT NULL AFTER `created_at`;
