-- Starter master data for Lead Management. Safe to re-run; the admin can
-- rename, add or deactivate any of this from a future settings screen.

INSERT IGNORE INTO `crm_lead_sources` (`id`, `name`) VALUES
  (UUID(), 'Lead Provider'),
  (UUID(), 'Referral'),
  (UUID(), 'Website'),
  (UUID(), 'Google'),
  (UUID(), 'Field Visit'),
  (UUID(), 'Existing Client Reference'),
  (UUID(), 'Other');

INSERT IGNORE INTO `crm_lead_loss_reasons` (`id`, `name`) VALUES
  (UUID(), 'Not Interested'),
  (UUID(), 'Budget Issue'),
  (UUID(), 'Competitor Selected'),
  (UUID(), 'Duplicate'),
  (UUID(), 'Invalid Contact'),
  (UUID(), 'Already Have a Vendor'),
  (UUID(), 'Unreachable');
