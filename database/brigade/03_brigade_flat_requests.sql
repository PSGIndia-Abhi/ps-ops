-- =====================================================================
-- Brigade flat requests (Brigade Executive)
--
-- Adds ONE new table. No existing table is changed.
--
-- Step 1 "New Brigade booking" saves only the flat (property, flat number,
-- BHK, requested by, optional PO / notes) as a PENDING request — no job yet.
-- Step 2 "Add services" books services, dates and team for that flat through
-- the normal Brigade booking (jobs, visits, technician app as today) and marks
-- the request BOOKED.
--
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS brigade_flat_requests (
  id                 CHAR(36)      NOT NULL,
  company_id         CHAR(36)      NOT NULL,   -- property (Brigade Group company)
  site_id            CHAR(36)      NOT NULL,   -- property site used for the address
  flat_number        VARCHAR(10)   NOT NULL,   -- e.g. L-0123
  bhk                VARCHAR(20)   NOT NULL,   -- from the BHK types master
  contact_id         CHAR(36)      NOT NULL,   -- requested by
  address            TEXT          NULL,
  client_po_number   VARCHAR(100)  NULL,
  po_source          VARCHAR(255)  NULL,
  po_date            DATE          NULL,
  po_amount          DECIMAL(12,2) NULL,
  notes              TEXT          NULL,
  status             ENUM('PENDING','BOOKED','CANCELED') NOT NULL DEFAULT 'PENDING',
  booking_id         CHAR(36)      NULL,       -- the booking made in step 2
  created_by_user_id BIGINT        NULL,
  booked_by_user_id  BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booked_at          DATETIME      NULL,
  canceled_at        DATETIME      NULL,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_brigade_flat_req_status (status),
  KEY idx_brigade_flat_req_flat (company_id, flat_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade flats waiting for services (step 1 of a Brigade booking)';
