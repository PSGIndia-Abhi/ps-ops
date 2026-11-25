-- Purchase orders: area and rate for BOTH square feet and square meter on one Termite PO.
--
-- A PO can now carry an area and a rate per unit for sq. ft, for sq. m, or for both (one row per
-- unit). The area billed on issued invoices in that unit is deducted from that unit's area.
--
--   customer_po_area_rates (po_id, unit 'sq.ft' / 'sq.m', area, rate)   one row per PO and unit
--
-- Areas saved earlier on customer_pos (po_area / po_area_unit / po_rate, from 20261205 / 20261206)
-- are copied in. Those columns stay in the table but are no longer used.
-- Run once, after 20261206. Safe to re-run. In phpMyAdmin, select the ps_ops database in the left
-- panel first (or keep the USE line).

USE ps_ops;

CREATE TABLE IF NOT EXISTS customer_po_area_rates (
  po_id   CHAR(36)      NOT NULL,
  unit    VARCHAR(10)   NOT NULL,          -- 'sq.ft' or 'sq.m'
  area    DECIMAL(14,2) NOT NULL,          -- the area the PO covers in this unit
  rate    DECIMAL(14,4) NOT NULL,          -- the rate per this unit
  PRIMARY KEY (po_id, unit),
  CONSTRAINT fk_cpar_po FOREIGN KEY (po_id) REFERENCES customer_pos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO customer_po_area_rates (po_id, unit, area, rate)
SELECT id, po_area_unit, po_area, COALESCE(po_rate, 0)
  FROM customer_pos
 WHERE po_area IS NOT NULL AND po_area_unit IN ('sq.ft', 'sq.m');
