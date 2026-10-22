-- =====================================================================
-- Managing Director / Personal Assistant work Lead Management (Commercial and Residential)
-- as a sales manager: they get the sales manager's lead permissions.
--   MANAGE_LEADS    - assign leads, team follow-ups / visits, manage every lead
--   CONVERT_LEAD    - convert a lead to a customer
--   VIEW_TEAM_LEADS - see the team's leads
-- Adds rows only (no schema change, nothing removed). Safe to re-run (INSERT IGNORE).
-- Run on local, then production - with (or before) the backend/web/app that uses it.
-- =====================================================================

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('MANAGE_LEADS', 'CONVERT_LEAD', 'VIEW_TEAM_LEADS')
 WHERE r.name IN ('Managing Director', 'Personal Assistant');

-- Check: each of the two roles should list all three.
SELECT r.name AS role, GROUP_CONCAT(p.name ORDER BY p.name) AS lead_permissions
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE r.name IN ('Managing Director', 'Personal Assistant')
   AND p.name IN ('MANAGE_LEADS', 'CONVERT_LEAD', 'VIEW_TEAM_LEADS')
 GROUP BY r.name;
