-- A generic "staff" role for people in the org hierarchy who aren't field
-- techs/supervisors/branch admins/clients — the department roles from the
-- User Hierarchy tree (Marketing Executive, Accounts Head, Tech Lead, ...).
-- They log in to a small self-service panel (/staff) built on the existing
-- GET /api/users/me/hierarchy and /me/team endpoints, which need no special
-- permission beyond being signed in — so this role is intentionally seeded
-- with zero rows in role_permissions (least privilege; grant more via Roles
-- & Permissions if a real use needs it).
--
-- roles.name has no unique constraint, so guard the insert to stay re-runnable.
INSERT INTO `roles` (`name`)
SELECT 'staff' WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'staff');
