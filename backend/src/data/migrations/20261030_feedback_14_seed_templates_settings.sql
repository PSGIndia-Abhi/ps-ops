-- Customer Feedback Tickets, step 14 of 15: starting WhatsApp templates and settings.
--
-- Templates (edited later in Masters -> WhatsApp templates):
--   FEEDBACK_SUMMARY  to Operations / the technician after a complaint is saved
--   REVISIT_BOOKED    to the customer when a re-visit is booked from the ticket
--   FORM_LINK         to the customer when the call isn't answered
-- Settings (edited later in Masters -> Form link rules):
--   other_text_enabled             1  show the optional "Other feedback" box
--   link_expiry_days               3  days a form link stays valid
--   offer_link_after_missed_calls  1  missed calls before the app offers the form link
--   notify_collector_on_form       1  notify the collector when a form is submitted
--
-- Needs: 03_whatsapp_templates, 04_settings. Inserts rows only; re-running keeps edits.
-- Safe to re-run.

INSERT IGNORE INTO `feedback_whatsapp_templates` (`code`, `name`, `body`, `audiences`) VALUES
  ('FEEDBACK_SUMMARY', 'Feedback summary',
   'Ticket {ticket} · {priority}\n{customer}, {site} · service {date}\nFeedback: {feedback}\nAction: {action}',
   'OPERATIONS,TECHNICIAN'),
  ('REVISIT_BOOKED', 'Re-visit booked',
   'Hello, thank you for your feedback on the service at {site}. We have booked a re-visit on {date}. Ticket {ticket}. - {collector}, BestServe',
   'CUSTOMER'),
  ('FORM_LINK', 'Feedback form link',
   'Hello, we tried calling about your service on {date}. Please share feedback here: {link}',
   'CUSTOMER');

INSERT IGNORE INTO `feedback_settings` (`setting_key`, `setting_value`) VALUES
  ('other_text_enabled', '1'),
  ('link_expiry_days', '3'),
  ('offer_link_after_missed_calls', '1'),
  ('notify_collector_on_form', '1');
