-- Permissions for the org hierarchy screens/APIs. Admin already bypasses
-- permission checks; other roles get these through Roles & Permissions.
-- permissions.name has no unique key, so guard each insert to stay re-runnable.

INSERT INTO `permissions` (`name`)
SELECT 'VIEW_HIERARCHY' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_HIERARCHY');

INSERT INTO `permissions` (`name`)
SELECT 'MANAGE_HIERARCHY' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'MANAGE_HIERARCHY');

INSERT INTO `permissions` (`name`)
SELECT 'MANAGE_DEPARTMENTS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'MANAGE_DEPARTMENTS');