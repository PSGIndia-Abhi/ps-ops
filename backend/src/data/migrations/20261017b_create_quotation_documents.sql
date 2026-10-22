-- What went into a quotation built in the app / web from the quotation master (customer block,
-- subject, services with their treatment rows and prices, clauses), saved as one JSON document
-- next to the crm_lead_quotations row. The generated PDF is stored as before (pdf_object_key);
-- this keeps the content so a quotation can be read back or revised later.
--
-- Uploaded-PDF quotations have no row here. Additive only: no existing table is changed.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS `crm_lead_quotation_documents` (
  `quotation_id` CHAR(36) NOT NULL,
  `content` JSON NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`quotation_id`),
  CONSTRAINT `fk_clqd_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `crm_lead_quotations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
