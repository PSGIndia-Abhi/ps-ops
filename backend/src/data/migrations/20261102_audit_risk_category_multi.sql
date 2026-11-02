-- Site Audits: a finding can have several risk categories, stored together as
-- "HARBOURAGE,CRACKS,Damaged wood". The column grows from 50 to 255 characters.
-- Existing values are kept as they are. Safe to run more than once.

ALTER TABLE audit_findings MODIFY risk_category VARCHAR(255) NOT NULL;
