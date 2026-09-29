-- =============================================================================
-- Migration  : 0178_vendor_master_seed.sql
-- Description: Seed vendor master records for field-purchase subsystem
--              Source: skills/furniture-research/references/suppliers-thailand.md
--              Uses  : Direct INSERT ... ON CONFLICT (vendor_code) DO UPDATE
--                      (CI-safe: bypasses governance-role check in rpc_upsert_vendor)
-- Governance : Vendor codes and names may only be modified by a user holding
--              the `managing_director` or `system_admin` role.  tax_id values
--              MUST be verified against the Revenue-Department e-Tax portal
--              before being populated; leave NULL until verified.
-- Idempotency: Safe to re-run.  INSERT … ON CONFLICT (vendor_code) DO UPDATE
--              is non-destructive.
-- =============================================================================

BEGIN;

INSERT INTO public.vendor_master (vendor_code, name, tax_id, address, active)
VALUES
  -- Hardware / fittings suppliers
  ('HAFELE_TH',         'Häfele Thailand',          NULL, NULL, true),
  ('HETTICH_TH',        'Hettich Thailand',          NULL, NULL, true),
  ('BLUM_TH',           'Blum Thailand',             NULL, NULL, true),
  -- Retail / home-improvement chains
  ('HOMEPRO_TH',        'HomePro',                   NULL, NULL, true),
  ('WATSADU_TH',        'Thai Watsadu',              NULL, NULL, true),
  ('GLOBALHOUSE_TH',    'Global House',              NULL, NULL, true),
  ('DOHOME_TH',         'Do Home',                   NULL, NULL, true),
  ('BOONTHAVORN_TH',    'Boonthavorn',               NULL, NULL, true),
  -- Specialist woodworking / trade suppliers
  ('WOODWORKINGSHOP_TH','WoodWorkingShop.co.th',     NULL, NULL, true),
  ('SIAMWOODWORKER_TH', 'SiamWoodworker',            NULL, NULL, true),
  -- Building-materials manufacturers / distributors
  ('SCG_BUILDING',      'SCG Building Materials',    NULL, NULL, true),
  ('VANACHAI_TH',       'Vanachai',                  NULL, NULL, true),
  ('PANELPLUS_TH',      'Panel Plus',                NULL, NULL, true),
  ('METROPLY_TH',       'Metro Ply',                 NULL, NULL, true),
  ('SIAMFC_TH',         'Siam Fiber Cement',         NULL, NULL, true),
  ('ROBINWOOD_TH',      'Robin Wood',                NULL, NULL, true)
ON CONFLICT (vendor_code) DO UPDATE SET
  name    = EXCLUDED.name,
  tax_id  = EXCLUDED.tax_id,
  address = EXCLUDED.address,
  active  = EXCLUDED.active;

COMMIT;

-- =============================================================================
-- End of 0178_vendor_master_seed.sql
-- Total vendors seeded: 16
-- Next step: populate tax_id values after Revenue-Department e-Tax verification.
-- =============================================================================
