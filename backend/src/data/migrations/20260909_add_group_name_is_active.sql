-- Groups, companies, and sites are moving to soft delete: instead of a hard
-- DELETE (which today gets blocked whenever a child row still references the
-- parent — companies under a group, sites under a company, contacts/jobs
-- under a site), the row is marked inactive and hidden from lists instead.
-- `sites` and `companies` already have `is_active`; `group_name` is missing
-- it, so add it here to match.
ALTER TABLE `group_name`
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `name`;
