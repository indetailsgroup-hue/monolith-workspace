-- =============================================================================
-- Migration: 20261115_org_members_add_hierarchy_level.sql
-- Purpose:   Add hierarchy_level column to public.org_members.
--            All 2027-era RLS policies (20270120+) assume this column exists
--            with the check `AND hierarchy_level >= 80`.
--
--            Role mapping:
--              OWNER      = 100
--              ADMIN      = 80
--              DESIGNER   = 60
--              FACTORY    = 50
--              INSTALLER  = 40
--              FINANCE    = 30
--              VIEWER     = 10
--
-- Safe to apply multiple times (ADD COLUMN IF NOT EXISTS + idempotent UPDATE).
-- =============================================================================

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS hierarchy_level INT NOT NULL DEFAULT 0;

-- Backfill existing rows based on role value
UPDATE public.org_members
SET hierarchy_level = CASE role
  WHEN 'OWNER'     THEN 100
  WHEN 'ADMIN'     THEN 80
  WHEN 'DESIGNER'  THEN 60
  WHEN 'FACTORY'   THEN 50
  WHEN 'INSTALLER' THEN 40
  WHEN 'FINANCE'   THEN 30
  WHEN 'VIEWER'    THEN 10
  ELSE 0
END
WHERE hierarchy_level = 0;
