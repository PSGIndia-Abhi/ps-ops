-- Client Portal: service requests raised by client logins ("Request a Service").
--
-- A request waits here as NEW until staff handle it in Admin > Service Requests:
--   ASSIGNED   staff created the booking/job through the normal booking code (booking_id set)
--   REJECTED   staff declined it (staff_note tells the client why)
--   CANCELLED  the client withdrew it before it was handled
--
-- Nothing is created in bookings/jobs until staff press Assign.
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `client_service_requests` (
  `id`              CHAR(36)      NOT NULL,
  `company_id`      VARCHAR(20)   NOT NULL,
  `site_id`         VARCHAR(20)   NOT NULL,
  `requested_by`    BIGINT        NOT NULL,
  `service_type`    VARCHAR(20)   NOT NULL,
  `sub_services`    JSON          NOT NULL,
  `preferred_date`  DATE          NULL,
  `preferred_slot`  VARCHAR(20)   NULL,
  `notes`           VARCHAR(1000) NULL,
  `status`          ENUM('NEW','ASSIGNED','REJECTED','CANCELLED') NOT NULL DEFAULT 'NEW',
  `booking_id`      CHAR(36)      NULL,
  `staff_note`      VARCHAR(500)  NULL,
  `handled_by`      BIGINT        NULL,
  `handled_at`      DATETIME      NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_csr_status` (`status`, `created_at`),
  KEY `idx_csr_company` (`company_id`),
  KEY `idx_csr_site` (`site_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
