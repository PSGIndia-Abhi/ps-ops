-- Customer Feedback Tickets, step 16: an "Other" next step for a ticket.
--
-- When raising a ticket the collector can choose Other and type what will be done; the text is
-- kept in feedback_tickets.action_note (required for Other). Adds OTHER to the allowed values of
-- feedback_tickets.action only - existing values and rows are unchanged. Safe to re-run.

ALTER TABLE `feedback_tickets`
  MODIFY `action` ENUM('RESOLVED_ON_CALL','SCHEDULE_REVISIT','ESCALATE_OPERATIONS','OTHER') NOT NULL;
