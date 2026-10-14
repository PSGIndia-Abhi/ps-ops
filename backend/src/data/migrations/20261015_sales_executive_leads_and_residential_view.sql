-- Commercial sales executive = the "Sales Executive" role, and residential leads for the sales manager.
--
--   1. "Sales Executive" (the org-hierarchy role, already used by Task Management) becomes the
--      commercial sales executive in Lead Management (web) and the Lead app: it gets the lead
--      permissions commercial_sales had. Its existing permissions (VIEW_HIERARCHY) stay.
--   2. Everyone on the old "commercial_sales" role moves to "Sales Executive". The code no longer
--      knows commercial_sales; the role row itself is left in place (with no users).
--   3. The sales manager may read residential (consumer) leads: CRM_VIEW_ALL_LEADS, the permission
--      the MD / PA already hold for the same list. Read-only - nothing else changes for them.
--
-- Safe to run more than once: grants are INSERT IGNORE, the user move only touches users still on
-- commercial_sales. Nothing is deleted.

-- 1. Sales Executive: the commercial sales executive's lead permissions
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
 WHERE r.name = 'Sales Executive'
   AND p.name IN ('CRM_ACCESS', 'CRM_VIEW_LEAD', 'CRM_CREATE_LEAD', 'CONVERT_LEAD', 'CRM_VIEW_SERVICE_PRICE');

-- 2. Users on commercial_sales -> Sales Executive
UPDATE `users` u
  JOIN `roles` old_role ON old_role.id = u.role_id AND old_role.name = 'commercial_sales'
  JOIN `roles` new_role ON new_role.name = 'Sales Executive'
   SET u.role_id = new_role.id;

-- 3. Sales manager: read residential leads
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
 WHERE r.name = 'sales_manager'
   AND p.name = 'CRM_VIEW_ALL_LEADS';

-- Verify
-- SELECT r.name AS role, p.name AS permission FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
--  WHERE r.name IN ('Sales Executive', 'sales_manager') ORDER BY r.name, p.name;
-- SELECT u.email, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
--  WHERE r.name IN ('Sales Executive', 'commercial_sales');
