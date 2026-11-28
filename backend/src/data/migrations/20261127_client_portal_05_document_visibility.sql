-- Client Portal documents: who can see a shared document (Admin > Client Accounts > Documents).
--
--   client_documents.visibility
--     ALL          everyone in the company: head office (company logins) + every outlet login
--     HEAD_OFFICE  head office only (confidential): company logins only, outlet logins never see it
--     SITES        the outlets ticked in client_document_sites (head office also sees them)
--
--   client_document_sites  one row per ticked outlet of a SITES document.
--
-- Existing documents keep what they had: site_id NULL -> ALL; one outlet -> SITES with that outlet.
-- client_documents.site_id is kept (no longer written for new documents).
--
-- Adds one column and one new table; no data is removed. Safe to re-run.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_documents' AND COLUMN_NAME = 'visibility');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `client_documents` ADD COLUMN `visibility` ENUM(''ALL'',''HEAD_OFFICE'',''SITES'') NOT NULL DEFAULT ''ALL'' AFTER `site_id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `client_document_sites` (
  `document_id`  CHAR(36)     NOT NULL,
  `site_id`      VARCHAR(20)  NOT NULL,
  PRIMARY KEY (`document_id`, `site_id`),
  KEY `idx_cds_site` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Old single-outlet documents -> SITES with that outlet.
INSERT IGNORE INTO `client_document_sites` (`document_id`, `site_id`)
SELECT `id`, `site_id` FROM `client_documents` WHERE `site_id` IS NOT NULL;

UPDATE `client_documents` SET `visibility` = 'SITES'
WHERE `site_id` IS NOT NULL AND `visibility` = 'ALL';
