-- Customer Feedback Tickets, step 20: a WhatsApp "ticket raised" message for the customer.
--
-- Adds one row to feedback_whatsapp_templates: TICKET_RAISED, sent to the customer from the call
-- or ticket screen once a ticket is raised for their complaint (while it is open).
-- No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('TICKET_RAISED', 'Ticket raised',
   'Hello, thank you for your feedback on the service at {site}. We are sorry about the trouble - your concern is registered as ticket {ticket} and our team is working on it. We will update you soon. - {collector}, BestServe',
   'CUSTOMER');
