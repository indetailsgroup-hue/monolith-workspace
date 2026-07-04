-- Migration: line_oa_init (scaffold marker)
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 1.1 Scaffold migrations, Edge Functions, and the PBT harness
--
-- This is an intentionally empty scaffold migration. It exists so the migrations
-- pipeline has a discoverable entry point for the line_oa_* feature. The actual
-- schema objects are introduced by later tasks:
--   * enums + the eight line_oa_* tables          -> task 2.1
--   * uniqueness / partial-unique / CHECK          -> task 2.2
--   * RLS enable + SELECT policies                 -> task 3.1
--   * audit immutability trigger + REVOKE          -> task 3.2
--   * SECURITY DEFINER RPCs                         -> tasks 6-17
--
-- DO NOT add table or RPC definitions to this file. Add new timestamped
-- migration files instead (see README.md).

-- (no-op)
SELECT 1;
