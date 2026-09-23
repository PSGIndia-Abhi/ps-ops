-- Extra test customers and sites for the validation upload files (all names are made up).
-- Adds 12 customers and 17 sites. Nothing existing is changed or deleted.
-- Head Office = the accountant's branch. "abc" = the other branch.
-- To remove them, run cleanup_all_test_customers_and_sites.sql.

SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO companies (id, name, code, type, is_active, tds_applicable, tds_rate) VALUES
  (UUID(), 'Orchid Bakers & Confectioners',            'OBC11', 'CORPORATE',  1, 0, NULL),
  (UUID(), 'Silverline Logistics Pvt Ltd',             'SLL12', 'CORPORATE',  1, 1, 2.00),
  (UUID(), 'D''Souza & Daughters Jewellers',           'DSD13', 'INDIVIDUAL', 1, 1, 2.00),
  (UUID(), 'ಶ್ರೀ ಲಕ್ಷ್ಮಿ ಸ್ಟೋರ್ಸ್',                      'SLS14', 'INDIVIDUAL', 1, 0, NULL),
  (UUID(), '24x7 Fitness Studios',                     'FIT15', 'CORPORATE',  1, 1, 2.00),
  (UUID(), 'Maple Leaf International School',          'MLS16', 'CORPORATE',  1, 1, 2.00),
  (UUID(), 'Harbor View Resorts',                      'HVR17', 'CORPORATE',  1, 1, 2.00),
  (UUID(), CONCAT(REPEAT('Extra Long Name ', 12), 'Ltd'), 'LNG18', 'CORPORATE', 1, 0, NULL),
  (UUID(), 'Quick Fix Plumbing',                       'QFP19', 'INDIVIDUAL', 1, 0, NULL),
  (UUID(), 'Ambar Textiles',                           'ABT20', 'CORPORATE',  1, 1, 2.00),
  (UUID(), 'Northstar Clinics',                        'NSC21', 'CORPORATE',  1, 1, 2.00),
  (UUID(), 'Brightside Coaching Institute',            'BCI22', 'CORPORATE',  1, 0, NULL);

INSERT INTO sites (id, company_id, branch_id, address, city, state, is_active, name)
SELECT UUID(), c.id, b.id, v.address, 'Bengaluru', 'Karnataka', v.active, v.name
FROM (
  SELECT 'Orchid - Central Bakery' AS name, 'OBC11' AS code, 'Head Office' AS branch, 1 AS active, '5, Commercial Street' AS address UNION ALL
  SELECT 'Orchid - Mall Outlet',            'OBC11', 'Head Office', 1, 'Ground Floor, Forum Mall' UNION ALL
  SELECT 'Silverline - Hub 1',              'SLL12', 'Head Office', 1, 'Hub 1, Peenya Industrial Area' UNION ALL
  SELECT 'Silverline - Hub 2',              'SLL12', 'Head Office', 1, 'Hub 2, Bommasandra' UNION ALL
  SELECT 'D''Souza - Commercial Street',    'DSD13', 'Head Office', 1, '77, Commercial Street' UNION ALL
  SELECT 'ಶ್ರೀ ಲಕ್ಷ್ಮಿ - ಮುಖ್ಯ ಅಂಗಡಿ',         'SLS14', 'Head Office', 1, 'Main Road, Malleshwaram' UNION ALL
  SELECT '24x7 - Koramangala Studio',       'FIT15', 'Head Office', 1, '6th Block, Koramangala' UNION ALL
  SELECT 'Maple Leaf - Junior Wing',        'MLS16', 'Head Office', 1, 'Sarjapur Road' UNION ALL
  SELECT 'Maple Leaf - Senior Wing',        'MLS16', 'Head Office', 1, 'Sarjapur Road, Block B' UNION ALL
  SELECT 'Harbor - Beach Block',            'HVR17', 'Head Office', 1, 'Beach Road, Mangaluru' UNION ALL
  SELECT 'Extra Long Name - Plant',         'LNG18', 'Head Office', 1, 'Plot 1, Hoskote Industrial Area' UNION ALL
  SELECT 'Quick Fix - Shop 5, Ground Floor','QFP19', 'Head Office', 1, 'Shop 5, Ground Floor, Chickpet' UNION ALL
  SELECT 'Ambar - Godown A',                'ABT20', 'Head Office', 1, 'Godown A, Yeshwanthpur' UNION ALL
  SELECT 'Ambar - Godown B (closed)',       'ABT20', 'Head Office', 0, 'Closed godown (INACTIVE site)' UNION ALL
  SELECT 'Northstar - Clinic 1',            'NSC21', 'Head Office', 1, 'Clinic 1, Rajajinagar' UNION ALL
  SELECT 'Northstar - Clinic 2',            'NSC21', 'Head Office', 1, 'Clinic 2, Malleshwaram' UNION ALL
  SELECT 'Brightside - Annex (other branch)','BCI22','abc',         1, 'Annex, Electronic City'
) v
JOIN companies c ON c.code = v.code
JOIN branches  b ON b.name = v.branch;

COMMIT;

SELECT (SELECT COUNT(*) FROM companies WHERE code IN ('OBC11','SLL12','DSD13','SLS14','FIT15','MLS16','HVR17','LNG18','QFP19','ABT20','NSC21','BCI22')) AS extra_customers,
       (SELECT COUNT(*) FROM sites s JOIN companies c ON c.id = s.company_id WHERE c.code IN ('OBC11','SLL12','DSD13','SLS14','FIT15','MLS16','HVR17','LNG18','QFP19','ABT20','NSC21','BCI22')) AS extra_sites;
