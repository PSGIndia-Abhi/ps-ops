-- Grants the generic Task Management module's permissions (added in
-- 20260926_add_work_task_permissions.sql) to the real org-hierarchy roles,
-- matching each role's position in `user_hierarchy` at the time this was
-- written: MD is the root of the whole company; every "*Head", "*Manager",
-- "Personal Assistant" and "Technical Lead" role sits above at least one
-- other person (or is expected to, as the org grows).
--
-- MANAGE_TEAM_WORK_TASKS lets a role see, assign and edit tasks for everyone
-- below them in the hierarchy (their real subtree, via getTeamUserIds — a
-- role with no reports today is simply a no-op grant). VIEW_ALL_WORK_TASKS
-- (company-wide, no filter) is reserved for Managing Director only.
-- DELETE_WORK_TASK goes with MANAGE_TEAM_WORK_TASKS so a head can also
-- cancel a team task they didn't personally create or get assigned.
--
-- role_permissions has no surrogate key (role_id, permission_id) IS the
-- primary key, so INSERT IGNORE is enough to stay safely re-runnable.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
  FROM `roles` r, `permissions` p
 WHERE r.name = 'Managing Director'
   AND p.name IN ('VIEW_ALL_WORK_TASKS', 'MANAGE_TEAM_WORK_TASKS', 'DELETE_WORK_TASK');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
  FROM `roles` r, `permissions` p
 WHERE r.name IN (
         'Personal Assistant', 'Technical Head', 'Technical Lead',
         'Marketing Head', 'Sales Head', 'Operations Head', 'Operations Manager',
         'Quality Head', 'Accounts Head'
       )
   AND p.name IN ('MANAGE_TEAM_WORK_TASKS', 'DELETE_WORK_TASK');
