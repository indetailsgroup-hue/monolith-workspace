-- =============================================================================
-- Migration 0221: Add usage-quota columns to public.organizations
--
-- Background: 20260828_multi_tenant_schema.sql defines max_jobs_per_month and
-- max_users in its CREATE TABLE block, but CI skips that file (CREATE TABLE IF
-- NOT EXISTS + table already exists from an earlier migration).  The
-- check_job_limit() / check_member_limit() functions reference these columns;
-- without them every INSERT into jobs raises 42703.
--
-- This migration adds the columns idempotently.
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_jobs_per_month INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 2;
