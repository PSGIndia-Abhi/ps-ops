-- Starting data for the org hierarchy, taken from BestServe's real structure.
-- This is only initial data — admins can rename, add, move or deactivate any
-- of it from the Departments screen. Safe to re-run: designations are
-- INSERT IGNORE on their unique name, and units are only added if missing.

INSERT IGNORE INTO `designations` (`id`, `name`) VALUES
  (UUID(), 'MD'),
  (UUID(), 'Personal Secretary'),
  (UUID(), 'Marketing Head'),
  (UUID(), 'Marketing Executive'),
  (UUID(), 'Sales Head'),
  (UUID(), 'Sales Executive'),
  (UUID(), 'Operation Head'),
  (UUID(), 'Store Manager'),
  (UUID(), 'Branch Head'),
  (UUID(), 'Supervisor'),
  (UUID(), 'Technician'),
  (UUID(), 'Quality Head'),
  (UUID(), 'Service Coordinator'),
  (UUID(), 'Accounts Head'),
  (UUID(), 'Accounts Executive'),
  (UUID(), 'Collection Executive'),
  (UUID(), 'HR'),
  (UUID(), 'Tech Head'),
  (UUID(), 'Tech Lead'),
  (UUID(), 'Tech Team');

-- Root unit (only if there is no root yet).
INSERT INTO `org_units` (`id`, `name`, `parent_id`, `unit_type`, `sort_order`)
SELECT UUID(), 'BestServe', NULL, 'Organization', 0
WHERE NOT EXISTS (SELECT 1 FROM `org_units` WHERE `parent_id` IS NULL AND `name` = 'BestServe');

-- Departments under the root, each only if missing.
INSERT INTO `org_units` (`id`, `name`, `parent_id`, `unit_type`, `sort_order`)
SELECT UUID(), d.name, r.id, 'Department', d.sort_order
FROM (
  SELECT 'Executive Office' AS name, 1 AS sort_order UNION ALL
  SELECT 'Marketing', 2 UNION ALL
  SELECT 'Sales', 3 UNION ALL
  SELECT 'Operations', 4 UNION ALL
  SELECT 'Quality', 5 UNION ALL
  SELECT 'Accounts', 6 UNION ALL
  SELECT 'Collection', 7 UNION ALL
  SELECT 'HR', 8 UNION ALL
  SELECT 'Tech', 9
) AS d
JOIN `org_units` r ON r.`parent_id` IS NULL AND r.`name` = 'BestServe'
WHERE NOT EXISTS (
  SELECT 1 FROM `org_units` u WHERE u.`parent_id` = r.`id` AND u.`name` = d.name
);
