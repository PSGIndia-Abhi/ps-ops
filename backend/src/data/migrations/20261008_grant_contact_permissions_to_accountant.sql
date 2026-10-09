-- Lets the accountant add and edit a customer's phone number from the Accountant
-- panel (reminder side panel and reminder page). Saving goes through the existing
-- Contacts API (POST / PUT /api/contacts), which needs CREATE_CONTACT and
-- UPDATE_CONTACT; the accountant role only had VIEW_CONTACT.
--
-- No table or column is added: this only inserts two rows into role_permissions.
-- (role_id, permission_id) is the primary key, so INSERT IGNORE is safely re-runnable.
-- The same grant can be made (or removed) by an admin on the Roles screen.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
  FROM `roles` r, `permissions` p
 WHERE r.name = 'accountant'
   AND p.name IN ('CREATE_CONTACT', 'UPDATE_CONTACT');
