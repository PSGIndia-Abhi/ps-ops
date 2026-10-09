-- Widens "Nth weekday of the month" to allow picking several ordinals and
-- several weekdays at once (e.g. "the 1st and 3rd Monday and Friday" of
-- every month), not just one of each.
--
-- month_week was added as a single TINYINT by 20261002_add_month_week_to_
-- work_task_recurrence.sql, shipped in the same release and not yet used by
-- any real series, so widening its type in place is safe - nothing to
-- migrate. It now holds a JSON array of ordinals (1-4 = First..Fourth,
-- -1 = Last), the same shape `days_of_week` already uses for weekdays.
--
-- Safe to re-run: MODIFY COLUMN is idempotent.

ALTER TABLE `work_task_recurrence`
  MODIFY COLUMN `month_week` JSON NULL;
