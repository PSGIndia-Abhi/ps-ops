-- Invoice generation: "Billing frequency" becomes a master list (Masters > Billing Frequencies).
-- A contract picks its frequency (every N months, 1 to 12) from the active entries; contracts keep
-- the frequency they already have even if that entry is switched off later.
--
-- Starts with 1, 3, 4, 5, 6 and 12 months and every frequency already used on a contract.
-- New table only; nothing existing is changed. Run once (after 20261116_billing_module.sql).
-- Safe to re-run: the months value is the key.

CREATE TABLE IF NOT EXISTS billing_frequencies (
  months      TINYINT     NOT NULL,
  is_active   TINYINT(1)  NOT NULL DEFAULT 1,
  created_by  BIGINT      NULL,
  updated_by  BIGINT      NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (months),
  CONSTRAINT chk_bfreq_months CHECK (months BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Invoice generation: the billing frequencies (every N months) a contract can pick';

INSERT IGNORE INTO billing_frequencies (months) VALUES (1), (3), (4), (5), (6), (12);

INSERT IGNORE INTO billing_frequencies (months)
SELECT DISTINCT frequency_months FROM billing_contracts
 WHERE frequency_months BETWEEN 1 AND 12;
