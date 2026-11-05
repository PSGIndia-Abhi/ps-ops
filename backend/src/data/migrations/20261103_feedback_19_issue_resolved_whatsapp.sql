-- Customer Feedback Tickets, step 19: a WhatsApp "issue resolved" message for the customer.
--
-- Adds one row to feedback_whatsapp_templates: ISSUE_RESOLVED, sent to the customer from the call
-- or ticket screen once the ticket is closed (the customer confirmed on the follow-up call).
-- No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('ISSUE_RESOLVED', 'Issue resolved',
   'Hello, thank you for your patience. Your concern about the service at {site} (ticket {ticket}) has been resolved. We are glad it is sorted. For anything else, please contact us. - {collector}, BestServe',
   'CUSTOMER');
