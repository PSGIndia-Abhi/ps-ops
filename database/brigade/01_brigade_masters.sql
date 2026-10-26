-- =====================================================================
-- Brigade Executive module (NEW, additive only - no existing table or row
-- is changed)
--   * Role        : brigade_executive
--   * Permissions : BRIGADE_ACCESS, BRIGADE_MANAGE_MASTERS (new) + the
--                   existing contact/booking/job/analytics view permissions
--   * Group       : "Brigade Group" (new group in Group Management; every
--                   property is a company inside this group)
--   * Masters     : brigade_bhk_types (BHK types used in the dropdowns)
--                   brigade_flats   (property -> flat number + BHK)
--                   brigade_prices  (property + BHK + sub-service, optional
--                                    flat-specific override)
--   * Booking     : brigade_booking_details (property / flat / price / PO
--                   per booking, linked 1:1 to bookings.id)
-- Target: MySQL (ps_ops). Safe to re-run: IF NOT EXISTS / NOT EXISTS checks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Group: "Brigade Group"
-- group_name.name is UNIQUE. Before running, check that no existing group
-- already uses this exact name:
--   SELECT id, name FROM group_name WHERE name = 'Brigade Group';
-- (If one exists, it would be reused instead of a new one being created.)
-- ---------------------------------------------------------------------
INSERT INTO group_name (id, name, created_at)
SELECT UUID(), 'Brigade Group', NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM group_name WHERE name = 'Brigade Group');

-- ---------------------------------------------------------------------
-- Master 0: BHK types (the BHK dropdowns on Flats & Prices). Flats and
-- prices store the BHK name as text; renaming a type in the app renames it
-- on existing flats and prices too.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brigade_bhk_types (
  id                 CHAR(36)     NOT NULL,
  name               VARCHAR(20)  NOT NULL,   -- e.g. 2 BHK, Villa
  sort_order         INT          NOT NULL DEFAULT 0,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_by_user_id BIGINT       NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_bhk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade BHK types (master for the BHK dropdowns)';

-- Seed: the list the app used before this master existed.
INSERT IGNORE INTO brigade_bhk_types (id, name, sort_order) VALUES
  (UUID(), '1 BHK', 1),
  (UUID(), '2 BHK', 2),
  (UUID(), '3 BHK', 3),
  (UUID(), '4 BHK', 4),
  (UUID(), '5 BHK', 5),
  (UUID(), 'Villa', 6);

-- ---------------------------------------------------------------------
-- Master 1: flats of a property (property = companies row in Brigade Group)
-- flat_number format: one capital letter, hyphen, 4 digits (e.g. L-0123);
-- enforced by the backend on every insert/update.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brigade_flats (
  id                 CHAR(36)     NOT NULL,
  company_id         CHAR(36)     NOT NULL,   -- property
  flat_number        VARCHAR(10)  NOT NULL,   -- L-0123
  bhk                VARCHAR(20)  NOT NULL,   -- 1 BHK, 2 BHK, ...
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_by_user_id BIGINT       NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_flat (company_id, flat_number),
  CONSTRAINT fk_brigade_flat_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade property flats (flat number + BHK)';

-- ---------------------------------------------------------------------
-- Master 2: prices
-- flat_id NULL  -> price for every flat of that BHK in the property
-- flat_id set   -> override for that one flat (wins over the BHK price)
-- Prices are INR, excluding GST.
-- fk_brigade_price_flat has no ON DELETE CASCADE: MySQL does not allow a
-- cascading FK on a column that a STORED generated column (flat_key) is
-- built from. The backend deletes a flat's override prices before the flat.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brigade_prices (
  id                 CHAR(36)      NOT NULL,
  company_id         CHAR(36)      NOT NULL,   -- property
  bhk                VARCHAR(20)   NOT NULL,
  sub_service        VARCHAR(100)  NOT NULL,   -- e.g. Deep Cleaning with Scrubbing
  flat_id            CHAR(36)      NULL,
  flat_key           CHAR(36)      GENERATED ALWAYS AS (IFNULL(flat_id, '')) STORED,
  price              DECIMAL(10,2) NOT NULL,
  created_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brigade_price (company_id, bhk, sub_service, flat_key),
  KEY idx_brigade_price_flat (flat_id),
  CONSTRAINT fk_brigade_price_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_brigade_price_flat FOREIGN KEY (flat_id) REFERENCES brigade_flats (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade prices per property + BHK + sub-service, optional flat override (excl. GST)';

-- ---------------------------------------------------------------------
-- Booking details: one row per Brigade booking. A job is a "Brigade job"
-- when jobs.booking_id has a row here (drives the before/after photo flow).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brigade_booking_details (
  booking_id         CHAR(36)      NOT NULL,
  company_id         CHAR(36)      NOT NULL,   -- property
  site_id            CHAR(36)      NULL,       -- property site used for the address
  flat_id            CHAR(36)      NULL,
  flat_number        VARCHAR(10)   NOT NULL,   -- snapshot at booking time
  bhk                VARCHAR(20)   NOT NULL,   -- snapshot at booking time
  prices             JSON          NULL,       -- { "<sub-service>": price, ... } snapshot
  total_price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  client_po_number   VARCHAR(100)  NULL,
  po_source          VARCHAR(255)  NULL,       -- "where it comes from" (free text)
  po_date            DATE          NULL,
  po_amount          DECIMAL(12,2) NULL,
  created_by_user_id BIGINT        NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (booking_id),
  KEY idx_brigade_booking_company (company_id),
  CONSTRAINT fk_brigade_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Brigade booking extras: property, flat, price snapshot, client PO';

-- ---------------------------------------------------------------------
-- Permissions (new)
-- ---------------------------------------------------------------------
INSERT INTO permissions (name)
SELECT 'BRIGADE_ACCESS' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'BRIGADE_ACCESS');

INSERT INTO permissions (name)
SELECT 'BRIGADE_MANAGE_MASTERS' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'BRIGADE_MANAGE_MASTERS');

-- ---------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------
INSERT INTO roles (name)
SELECT 'brigade_executive' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'brigade_executive');

-- ---------------------------------------------------------------------
-- Grant: brigade_executive
--   Brigade module      : BRIGADE_ACCESS, BRIGADE_MANAGE_MASTERS
--   Companies / sites / contacts / groups (add, edit, delete): *_CONTACT
--   Bookings / jobs     : VIEW_BOOKING, CREATE_BOOKING, VIEW_JOB, ADD_JOB_COMMENT, VIEW_VISIT
--   Job page controls   : UPDATE_JOB (schedule), UPDATE_JOB_STATUS (start/pause/
--                         complete), REASSIGN_JOB (assign team), CREATE_VISIT,
--                         UPDATE_VISIT (reschedule/cancel/technicians), APPROVE_VISIT
--                         - the backend allows these on Brigade Group jobs only.
--                         START_VISIT / SUBMIT_VISIT stay technician-only.
--   Dashboard           : the jobs list (VIEW_JOB), limited to Brigade Group by
--                         the backend. No analysis: VIEW_ANALYTICS is NOT granted.
--   Assign Team picker  : VIEW_USER (lists supervisors / technicians)
-- Data is limited to Brigade Group by the backend, not by these permissions.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'brigade_executive'
  AND p.name IN ('BRIGADE_ACCESS', 'BRIGADE_MANAGE_MASTERS',
                 'VIEW_CONTACT', 'CREATE_CONTACT', 'UPDATE_CONTACT', 'DELETE_CONTACT',
                 'VIEW_BOOKING', 'CREATE_BOOKING', 'VIEW_JOB', 'ADD_JOB_COMMENT', 'VIEW_VISIT',
                 'UPDATE_JOB', 'UPDATE_JOB_STATUS', 'REASSIGN_JOB',
                 'CREATE_VISIT', 'UPDATE_VISIT', 'APPROVE_VISIT',
                 'VIEW_USER');

-- Removes VIEW_ANALYTICS if an earlier version of this script granted it.
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'brigade_executive' AND p.name = 'VIEW_ANALYTICS';

-- Verify
-- SELECT id, name FROM group_name WHERE name = 'Brigade Group';
-- SHOW TABLES LIKE 'brigade_%';                       -- expected: 4 tables
-- SELECT name FROM brigade_bhk_types ORDER BY sort_order;  -- expected: 6 rows
-- SELECT r.name AS role, p.name AS permission
-- FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- JOIN permissions p ON p.id = rp.permission_id
-- WHERE r.name = 'brigade_executive'
-- ORDER BY p.name;                                    -- expected: 18 rows
