-- Permission names for the generic Task Management module. Distinct from the
-- existing VIEW_TASK/CREATE_TASK/UPDATE_TASK (Accountant module). Acting on
-- your own task never needs a permission; these gate team/company-wide access.
-- permissions.name has no unique key, so each insert is guarded to stay re-runnable.

INSERT INTO `permissions` (`name`)
SELECT 'VIEW_TEAM_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_TEAM_WORK_TASKS');

INSERT INTO `permissions` (`name`)
SELECT 'MANAGE_TEAM_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'MANAGE_TEAM_WORK_TASKS');

INSERT INTO `permissions` (`name`)
SELECT 'VIEW_ALL_WORK_TASKS' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'VIEW_ALL_WORK_TASKS');

INSERT INTO `permissions` (`name`)
SELECT 'DELETE_WORK_TASK' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'DELETE_WORK_TASK');
