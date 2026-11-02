-- Customer Feedback Tickets, step 17: a WhatsApp thank-you for customers with no issue.
--
-- Adds one row to feedback_whatsapp_templates: THANK_YOU, sent to the customer from the call
-- screen when the call ends Good. No table change. Editable in Masters > WhatsApp templates.
-- INSERT IGNORE on the unique code, so it is safe to re-run and never overwrites an edited text.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('THANK_YOU', 'Thank you (no issue)',
   'Hello, thank you for your feedback and for choosing BestServe. We are glad you are happy with our service. For any service in future, please contact us. - {collector}, BestServe',
   'CUSTOMER');
