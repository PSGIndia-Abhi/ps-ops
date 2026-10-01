-- Lets every real org-hierarchy role look up ANY employee's place in the
-- hierarchy (GET /api/users/:id/hierarchy), not just their own. Needed so a
-- task's "Assigned To" can show who that person reports to — read-only,
-- structural info (name/role/manager chain), not sensitive like pay or PII.
--
-- Existing VIEW_HIERARCHY consumers (the admin User Hierarchy screen) are
-- unaffected: admin already bypasses every permission check.
--
-- VIEW_HIERARCHY itself turns out to have never been seeded into `permissions`
-- (it's used by requirePermission() in code — hierarchy.routes.js,
-- user-hierarchy.routes.js — but the row was missing, so no non-admin role
-- could ever have been granted it). Adding it here too, same guarded pattern
-- as 20260926_add_work_task_permissions.sql.

INSERT INTO `permissions` (`name`)
SELECT 'VIEW_HIERARCHY' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_HIERARCHY');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
  FROM `roles` r, `permissions` p
 WHERE r.name IN (
         'Managing Director', 'Personal Assistant',
         'Technical Head', 'Technical Lead', 'Technical Team',
         'Marketing Head', 'Marketing Executive',
         'Sales Head', 'Sales Executive',
         'Operations Head', 'Operations Manager', 'Service Coordinator', 'Quality Head',
         'Accounts Head', 'Accounts Executive', 'Collection Executive', 'Admin Executive'
       )
   AND p.name = 'VIEW_HIERARCHY';
