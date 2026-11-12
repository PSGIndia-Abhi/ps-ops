-- Client Portal documents: files our team shares with a client company
-- (service certificates, contracts, MSDS sheets, reports...), uploaded from Admin > Client Accounts.
--
--   company_id   the client company (companies.id)
--   site_id      one outlet (sites.id), or NULL = shared with the whole company (every login sees it)
--   valid_until  optional expiry date, shown to the client (e.g. a certificate)
--   is_active    0 = removed by staff (kept for history, hidden from the client)
--
-- Invoices, audit reports and service photos are NOT stored here; the portal reads them from
-- their own tables.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `client_documents` (
  `id`           CHAR(36)      NOT NULL,
  `company_id`   VARCHAR(20)   NOT NULL,
  `site_id`      VARCHAR(20)   NULL,
  `title`        VARCHAR(200)  NOT NULL,
  `doc_type`     VARCHAR(30)   NOT NULL DEFAULT 'OTHER',
  `object_key`   VARCHAR(500)  NOT NULL,
  `file_name`    VARCHAR(255)  NOT NULL,
  `file_type`    VARCHAR(120)  NULL,
  `size_bytes`   INT UNSIGNED  NULL,
  `valid_until`  DATE          NULL,
  `notes`        VARCHAR(500)  NULL,
  `is_active`    TINYINT(1)    NOT NULL DEFAULT 1,
  `uploaded_by`  BIGINT        NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_client_documents_company` (`company_id`, `is_active`),
  KEY `idx_client_documents_site` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
