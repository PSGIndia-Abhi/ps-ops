-- Brigade: the six properties of the client's Excel tracker that were missing
-- (Nanda Heights, Komarla Heights, Laguna, Atmosphere, Orchards, Horizon), so the
-- Import page can match every sheet. Run AFTER 01-07, once the backend is deployed.
--
-- Each property gets, exactly like "Brigade Eldorado":
--   - a company in "Brigade Group"                     (id COMP<next>, as the app numbers it)
--   - one site, copied from the Eldorado site          (id SITE<next>, same address, branch, map location)
--   - one requested-by contact, copied from Eldorado's  (same name, phone, email)
-- Real site address / contact can be edited later in Companies / Contacts.
--
-- It also adds the BHK types the tracker uses that the first script did not seed:
-- "1 RK" and "1.5 BHK" (Prices & BHK -> BHK list).
--
-- Safe to re-run: a property, site, contact or BHK type that already exists is left as it is.
-- Additive only: nothing existing is changed or deleted.

-- ---------------------------------------------------------------------
-- BHK types: 1 RK (shown first) and 1.5 BHK
-- ---------------------------------------------------------------------
INSERT INTO brigade_bhk_types (id, name, sort_order)
SELECT UUID(), '1 RK', 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM brigade_bhk_types WHERE name = '1 RK');
INSERT INTO brigade_bhk_types (id, name, sort_order)
SELECT UUID(), '1.5 BHK', 7 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM brigade_bhk_types WHERE name = '1.5 BHK');

SET @grp := (SELECT id FROM group_name WHERE name = 'Brigade Group' LIMIT 1);
SET @tpl_company := (SELECT id FROM companies WHERE name = 'Brigade Eldorado' AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @tpl_site := (SELECT id FROM sites WHERE company_id = @tpl_company AND is_active = 1 ORDER BY created_at LIMIT 1);
SET @tpl_contact := (SELECT id FROM contacts WHERE company_id = @tpl_site AND is_active = 1 ORDER BY is_primary DESC, created_at LIMIT 1);

-- Stop here if the template is missing (nothing below would insert anything).
SELECT IF(@grp IS NULL OR @tpl_site IS NULL OR @tpl_contact IS NULL,
          'STOP: Brigade Group / Brigade Eldorado site / its contact not found - nothing will be added',
          'OK: template found') AS template_check;

-- ---------------------------------------------------------------------
-- Brigade Nanda Heights
-- ---------------------------------------------------------------------
SET @name := 'Brigade Nanda Heights';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Brigade Komarla Heights
-- ---------------------------------------------------------------------
SET @name := 'Brigade Komarla Heights';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Brigade Laguna
-- ---------------------------------------------------------------------
SET @name := 'Brigade Laguna';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Brigade Atmosphere
-- ---------------------------------------------------------------------
SET @name := 'Brigade Atmosphere';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Brigade Orchards
-- ---------------------------------------------------------------------
SET @name := 'Brigade Orchards';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Brigade Horizon
-- ---------------------------------------------------------------------
SET @name := 'Brigade Horizon';
SET @cid := (SELECT id FROM companies WHERE name = @name AND group_id = @grp AND is_active = 1 LIMIT 1);
SET @new_cid := IF(@cid IS NULL AND @tpl_site IS NOT NULL,
  CONCAT('COMP', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM companies WHERE id LIKE 'COMP%')), NULL);
INSERT INTO companies (id, group_id, name, display_name, code, gst_number, type, is_active, created_at)
SELECT @new_cid, @grp, @name, @name, NULL, NULL, 'CORPORATE', 1, NOW() FROM DUAL WHERE @new_cid IS NOT NULL;
SET @cid := COALESCE(@cid, @new_cid);

SET @sid := (SELECT id FROM sites WHERE company_id = @cid AND is_active = 1 LIMIT 1);
SET @new_sid := IF(@sid IS NULL AND @cid IS NOT NULL,
  CONCAT('SITE', (SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 FROM sites WHERE id LIKE 'SITE%')), NULL);
SET @loc := UUID();
INSERT INTO locations (id, provider, provider_place_id, formatted_address, address_line_1, address_line_2, latitude, longitude, plus_code, city, state, postal_code, country, created_at, updated_at)
SELECT @loc, l.provider, l.provider_place_id, l.formatted_address, l.address_line_1, l.address_line_2, l.latitude, l.longitude, l.plus_code, l.city, l.state, l.postal_code, l.country, NOW(), NOW()
FROM sites s JOIN locations l ON l.id = s.location_id
WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
INSERT INTO sites (id, company_id, branch_id, location_id, name, address, city, state, is_active, created_at, updated_at)
SELECT @new_sid, @cid, s.branch_id, IF(EXISTS (SELECT 1 FROM locations WHERE id = @loc), @loc, NULL), s.name, s.address, s.city, s.state, 1, NOW(), NOW()
FROM sites s WHERE s.id = @tpl_site AND @new_sid IS NOT NULL;
SET @sid := COALESCE(@sid, @new_sid);

INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active, created_at, updated_at)
SELECT UUID(), @sid, c.name, c.phone, c.email, c.role, 1, c.is_verified, c.branch_id, 1, NOW(), NOW()
FROM contacts c
WHERE c.id = @tpl_contact AND @sid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts x WHERE x.company_id = @sid AND x.is_active = 1);

-- ---------------------------------------------------------------------
-- Check: every Brigade property with its site and contact count
-- (expected: the 6 above + Utopia + Eldorado, each with 1 site and at least 1 contact)
-- ---------------------------------------------------------------------
SELECT co.id AS company_id, co.name AS property, s.id AS site_id, s.name AS site,
       (SELECT COUNT(*) FROM contacts c WHERE c.company_id = s.id AND c.is_active = 1) AS contacts
FROM companies co
JOIN group_name g ON g.id = co.group_id AND g.name = 'Brigade Group'
LEFT JOIN sites s ON s.company_id = co.id AND s.is_active = 1
WHERE co.is_active = 1
ORDER BY co.name;

SELECT name AS bhk_type, sort_order FROM brigade_bhk_types WHERE is_active = 1 ORDER BY sort_order, name;
