-- Service agreements for converted commercial leads (customers).
--
-- A sales manager makes one on the web from the customer's details and the latest quotation;
-- the generated PDF (BestServe's standard agreement + Annexure-1) is stored in MinIO like a
-- quotation PDF. Later the signed copy is uploaded (signed_object_key) and the agreement is
-- SIGNED. Any number of agreements per lead (newest first).
--
-- Additive only: one new table and one new counter in `sequences`. No existing table is changed.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS `crm_lead_agreements` (
  `id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `agreement_number` VARCHAR(50) NOT NULL,
  -- CREATED: generated, waiting for signatures. SIGNED: the signed copy is uploaded.
  `status` VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  `term_start` DATE NOT NULL,
  `term_end` DATE NOT NULL,
  `monthly_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Everything that went into the agreement (parties, scope, charges, Annexure-1 rows).
  `content` JSON NOT NULL,
  `pdf_object_key` VARCHAR(500) NULL,
  `signed_object_key` VARCHAR(500) NULL,
  `signed_uploaded_by` BIGINT NULL,
  `signed_uploaded_at` DATETIME NULL,
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cla_number` (`agreement_number`),
  KEY `idx_cla_lead` (`lead_id`),
  CONSTRAINT `fk_cla_lead` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads` (`id`),
  CONSTRAINT `fk_cla_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cla_signed_by` FOREIGN KEY (`signed_uploaded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- AG-2026-000001, AG-2026-000002, ... (same counter table as lead and quotation numbers)
INSERT INTO `sequences` (`name`, `value`)
SELECT 'crm_agreement_number', 0 FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `sequences` WHERE `name` = 'crm_agreement_number');
