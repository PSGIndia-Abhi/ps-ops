-- Sales Field Tracking: the road route and petrol km of a closed field day, worked out once.
--
-- Petrol km (home -> each client -> home, by road) and the route line drawn along the roads both
-- come from Google's Routes API. The first time a sales manager / admin opens a CLOSED day
-- (every shift of that date ended) on the web, the browser asks Google once and saves the result
-- here; every later view - any manager, any computer - reads it from here with no Google request.
-- It also gives one fixed petrol km per executive per day, for petrol expense and monthly reports.
--
-- fingerprint: a hash of the day's GPS points and client punches when the result was worked out.
-- If late points arrive (phone was offline) the fingerprint no longer matches, so the next view
-- works the route out again and replaces the row. The home location used is the one at that time.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `sales_field_day_routes` (
  `user_id`       BIGINT        NOT NULL,
  `work_date`     DATE          NOT NULL,
  `fingerprint`   CHAR(40)      NOT NULL,
  -- NULL when the day had no client visit (nothing to measure) or no home location was set.
  `petrol_km`     DECIMAL(10,2) NULL,
  -- Road route (Google encoded polyline) along the GPS track; NULL when there was no track.
  `road_path`     MEDIUMTEXT    NULL,
  `computed_by`   BIGINT        NULL,
  `computed_at`   TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `work_date`),
  CONSTRAINT `fk_sfdr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
