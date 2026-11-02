-- Customer Feedback Tickets, step 15 of 15: permissions and the Feedback Collector role.
--
--   FEEDBACK_COLLECT  Android app: monthly call list, calls, answers, form links, raise tickets
--   FEEDBACK_VIEW     Feedback Desk and customer report: every call and ticket
--   FEEDBACK_MANAGE   change priority, owner and action; close and reopen tickets
--   FEEDBACK_ADMIN    Masters: questions, WhatsApp templates, form link rules
-- New role feedback_collector gets FEEDBACK_COLLECT. Operations Head and Operations Manager get
-- FEEDBACK_VIEW + FEEDBACK_MANAGE. Admin passes every check in code, so nothing is granted to it.
--
-- Adds rows to permissions, roles and role_permissions only. permissions.name and roles.name
-- have no unique key, so each insert is guarded. Safe to re-run.

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_COLLECT' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_COLLECT');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_VIEW' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_VIEW');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_MANAGE' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_MANAGE');

INSERT INTO `permissions` (`name`)
SELECT 'FEEDBACK_ADMIN' WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'FEEDBACK_ADMIN');

INSERT INTO `roles` (`name`)
SELECT 'feedback_collector' WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `name` = 'feedback_collector');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'feedback_collector'
  AND p.name = 'FEEDBACK_COLLECT';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name IN ('Operations Head', 'Operations Manager')
  AND p.name IN ('FEEDBACK_VIEW', 'FEEDBACK_MANAGE');
