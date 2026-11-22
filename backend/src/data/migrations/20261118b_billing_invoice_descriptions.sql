-- Invoice generation: "Description on invoice" becomes a master list (Masters > Invoice Descriptions).
-- A contract picks its description from the active entries; {month}, {period}, {from_month} and
-- {to_month} are filled in on each invoice as before (billing_contracts.description_template keeps
-- the chosen text, so contracts and invoices are unchanged).
--
-- Starts with the three standard wordings and every description already used on a contract.
-- Run once (after 20261116_billing_module.sql). Safe to re-run: the text is unique.

CREATE TABLE IF NOT EXISTS billing_invoice_descriptions (
  id          CHAR(36)     NOT NULL,
  text        VARCHAR(500) NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_by  BIGINT       NULL,
  updated_by  BIGINT       NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bid_text (text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: the descriptions a contract can print on its invoices';

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order) VALUES
  (UUID(), 'Pest control services for the month of {month}', 1),
  (UUID(), 'Pest control services for {from_month} to {to_month}', 2),
  (UUID(), 'Pest control service carried out on {period}', 3);

INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order)
SELECT UUID(), d.description_template, 10
  FROM (SELECT DISTINCT description_template FROM billing_contracts
         WHERE description_template IS NOT NULL AND description_template <> '') AS d;
