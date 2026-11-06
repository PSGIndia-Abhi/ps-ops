-- Sales Field Tracking: the road route and petrol km of a closed field day, worked out once.
--
-- Petrol km is counted per leg: shift start -> client 1 -> ... -> last client -> return. Each leg
-- pays the GPS km travelled on it, capped at its direct road km + 25%; the return is capped at the
-- road km from the last client back to the start point (see utils/salesFieldTracking.js).
-- The direct road km of the legs (leg_road_m) and the route line drawn along the roads come from
-- Google's Routes API: the first time a sales manager / admin opens a CLOSED day (every shift of
-- that date ended) on the web, the browser asks Google once and the server works the petrol out
-- and saves it here; every later view - any manager, any computer - reads it with no Google
-- request. It also gives one fixed petrol km per executive per day, for petrol expense and reports.
--
-- fingerprint: a hash of the day's GPS points and client punches when the result was worked out.
-- If late points arrive (phone was offline) the fingerprint no longer matches, so the next view
-- works the route out again and replaces the row.
--
-- New table only - no existing table is changed. Safe to re-run.

CREATE TABLE IF NOT EXISTS `sales_field_day_routes` (
  `user_id`       BIGINT        NOT NULL,
  `work_date`     DATE          NOT NULL,
  `fingerprint`   CHAR(40)      NOT NULL,
  -- NULL when the day had no client visit (nothing to measure).
  `petrol_km`     DECIMAL(10,2) NULL,
  -- Direct road metres of each petrol leg: [start->client 1, ..., client N-1->client N, client N->start].
  `leg_road_m`    JSON          NULL,
  -- Road route (Google encoded polyline) along the GPS track; NULL when there was no track.
  `road_path`     MEDIUMTEXT    NULL,
  `computed_by`   BIGINT        NULL,
  `computed_at`   TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `work_date`),
  CONSTRAINT `fk_sfdr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
