-- =====================================================================
-- One-time fix: make the plan names in crm_service_prices display-ready.
-- Needed only if you ran an EARLIER copy of crm_service_master.sql that stored
-- the uppercase names (ONE TIME, AMC, 2 SERVICE, 2 SERVICE WITH STEAM).
-- Re-running crm_service_master.sql does NOT fix it (its INSERT IGNORE sees the
-- old rows as duplicates), so run this instead. Safe to run more than once.
-- Touches only crm_service_prices.plan_type.
-- =====================================================================

UPDATE crm_service_prices
SET plan_type = CASE plan_type
    WHEN 'ONE TIME'             THEN 'One Time'
    WHEN 'AMC'                  THEN 'Annual AMC'
    WHEN '2 SERVICE'            THEN '2 Service'
    WHEN '2 SERVICE WITH STEAM' THEN '2 Service with Steam'
    ELSE plan_type
  END
WHERE plan_type IN ('ONE TIME', 'AMC', '2 SERVICE', '2 SERVICE WITH STEAM');

-- Verify (expected: One Time, Annual AMC, 2 Service, 2 Service with Steam)
-- SELECT DISTINCT plan_type FROM crm_service_prices ORDER BY 1;
  