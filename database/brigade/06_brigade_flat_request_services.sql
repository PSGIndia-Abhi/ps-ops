-- =====================================================================
-- Brigade pending-flat services (Brigade Executive)
--
-- Adds ONE new table. No existing table is changed.
--
-- A Brigade booking now saves the flat AND the services Brigade asked for
-- to Pending (no visit date or team yet). This table holds those services,
-- with the price-master price at the time of booking. "Schedule & assign"
-- on the pending flat later creates the jobs at these prices.
--
-- Run after 03_brigade_flat_requests.sql. Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS brigade_flat_request_services (
  id          CHAR(36)      NOT NULL,
  request_id  CHAR(36)      NOT NULL,   -- brigade_flat_requests.id
  sub_service VARCHAR(100)  NOT NULL,   -- e.g. Deep Cleaning
  price       DECIMAL(12,2) NULL,       -- price-master price when booked (excl. GST)
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_flat_req_service (request_id, sub_service),
  CONSTRAINT fk_brigade_flat_req_service FOREIGN KEY (request_id)
    REFERENCES brigade_flat_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Services chosen for a pending Brigade flat (before scheduling)';
