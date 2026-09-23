-- Removes ALL test customers and sites added for the upload tests (both setup scripts), found by their codes.
-- Safe by design: a site or customer that already has invoices is NOT deleted and shows up in the last query.
-- If you submitted the upload files, delete those invoices first (or keep the customers).

START TRANSACTION;

DELETE s FROM sites s
JOIN companies c ON c.id = s.company_id
WHERE c.code IN ('BWH01','SAO02','KTP03','GMS04','LDC05','CZS06','TWN07A','TWN07B','DRM09','SFC10',
                 'OBC11','SLL12','DSD13','SLS14','FIT15','MLS16','HVR17','LNG18','QFP19','ABT20','NSC21','BCI22')
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.site_id = s.id);

DELETE c FROM companies c
WHERE c.code IN ('BWH01','SAO02','KTP03','GMS04','LDC05','CZS06','TWN07A','TWN07B','DRM09','SFC10',
                 'OBC11','SLL12','DSD13','SLS14','FIT15','MLS16','HVR17','LNG18','QFP19','ABT20','NSC21','BCI22')
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.company_id = c.id);

COMMIT;

-- Anything left over (still has invoices/sites referencing it):
SELECT code, name FROM companies WHERE code IN ('BWH01','SAO02','KTP03','GMS04','LDC05','CZS06','TWN07A','TWN07B','DRM09','SFC10',
                 'OBC11','SLL12','DSD13','SLS14','FIT15','MLS16','HVR17','LNG18','QFP19','ABT20','NSC21','BCI22');
