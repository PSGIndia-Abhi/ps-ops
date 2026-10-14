-- Sequence for the human-readable quotation_number (QT-2026-000123), same
-- counter-table pattern already used for crm_lead_number.
INSERT INTO `sequences` (`name`, `value`) SELECT 'crm_quotation_number', 0 WHERE NOT EXISTS (SELECT 1 FROM `sequences` WHERE `name` = 'crm_quotation_number');

-- CONVERT_LEAD is a deliberately separate, more sensitive permission than
-- MANAGE_LEADS (it creates a real companies row) -- grant it to the same
-- roles that already hold the CRM_* lead permissions, so real accounts can
-- actually use the endpoint once it ships.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r, `permissions` p
 WHERE r.name IN ('sales', 'marketing') AND p.name = 'CONVERT_LEAD';
