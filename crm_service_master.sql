-- =====================================================================
-- CRM service masters (NEW, additive only - does not touch any existing table)
-- Source: "Bestserve New Price List 26.pdf" - Pest Control Residence
--   (Cockroach + Bedbugs only; Termite intentionally excluded)
-- Used only to drive dropdowns: service -> house type -> plan type -> price.
-- Target: local MySQL (ps_ops). Safe to re-run: IF NOT EXISTS / INSERT IGNORE.
-- All prices are INR ("Bestserve - Clients Price" column of the price list).
-- =====================================================================

-- Master 1: services
CREATE TABLE IF NOT EXISTS crm_services (
  id          CHAR(36)     NOT NULL,
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(100) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_services_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CRM service master';

-- Master 2: types (house type x plan type) and their price, per service
CREATE TABLE IF NOT EXISTS crm_service_prices (
  id          CHAR(36)      NOT NULL,
  service_id  CHAR(36)      NOT NULL,
  house_type  VARCHAR(30)   NOT NULL,   -- 1 BHK, 2 BHK, 3 BHK, 4 BHK/Villa
  plan_type   VARCHAR(50)   NOT NULL,   -- One Time, Annual AMC, 2 Service, 2 Service with Steam (shown as-is in the app dropdown)
  price       DECIMAL(10,2) NOT NULL,   -- INR
  sort_order  INT           NOT NULL DEFAULT 0,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_price_variant (service_id, house_type, plan_type),
  CONSTRAINT fk_crm_price_service FOREIGN KEY (service_id) REFERENCES crm_services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CRM service types (house type + plan) with price';

-- ---------------------------------------------------------------------
-- Seed: services
-- ---------------------------------------------------------------------
INSERT IGNORE INTO crm_services (id, name, category, sort_order) VALUES
  (UUID(), 'Cockroach Services', 'Pest Control - Residence', 1),
  (UUID(), 'Bedbugs Services',   'Pest Control - Residence', 2);

-- ---------------------------------------------------------------------
-- Seed: Cockroach Services - ONE TIME and AMC
-- ---------------------------------------------------------------------
INSERT IGNORE INTO crm_service_prices
  (id, service_id, house_type, plan_type, price, sort_order)
SELECT UUID(), s.id, t.house_type, t.plan_type, t.price, t.sort_order
FROM crm_services s
JOIN (
  SELECT '1 BHK'        AS house_type, 'One Time' AS plan_type, 2000.00 AS price, 1 AS sort_order
  UNION ALL SELECT '2 BHK',        'One Time', 2500.00, 2
  UNION ALL SELECT '3 BHK',        'One Time', 3000.00, 3
  UNION ALL SELECT '4 BHK/Villa',  'One Time', 3500.00, 4
  UNION ALL SELECT '1 BHK',        'Annual AMC',      4000.00, 5
  UNION ALL SELECT '2 BHK',        'Annual AMC',      5000.00, 6
  UNION ALL SELECT '3 BHK',        'Annual AMC',      6000.00, 7
  UNION ALL SELECT '4 BHK/Villa',  'Annual AMC',      7000.00, 8
) t
WHERE s.name = 'Cockroach Services';

-- ---------------------------------------------------------------------
-- Seed: Bedbugs Services - 2 Service and 2 Service with Steam
-- ---------------------------------------------------------------------
INSERT IGNORE INTO crm_service_prices
  (id, service_id, house_type, plan_type, price, sort_order)
SELECT UUID(), s.id, t.house_type, t.plan_type, t.price, t.sort_order
FROM crm_services s
JOIN (
  SELECT '1 BHK'        AS house_type, '2 Service' AS plan_type, 4000.00 AS price, 1 AS sort_order
  UNION ALL SELECT '2 BHK',        '2 Service',            5000.00, 2
  UNION ALL SELECT '3 BHK',        '2 Service',            6000.00, 3
  UNION ALL SELECT '4 BHK/Villa',  '2 Service',            7000.00, 4
  UNION ALL SELECT '1 BHK',        '2 Service with Steam', 6000.00, 5
  UNION ALL SELECT '2 BHK',        '2 Service with Steam', 7000.00, 6
  UNION ALL SELECT '3 BHK',        '2 Service with Steam', 8000.00, 7
  UNION ALL SELECT '4 BHK/Villa',  '2 Service with Steam', 9000.00, 8
) t
WHERE s.name = 'Bedbugs Services';

-- Verify (expected: 16 rows; Cockroach 8 + Bedbugs 8)
-- SELECT s.name, p.house_type, p.plan_type, p.price
-- FROM crm_service_prices p JOIN crm_services s ON s.id = p.service_id
-- ORDER BY s.sort_order, p.sort_order;
