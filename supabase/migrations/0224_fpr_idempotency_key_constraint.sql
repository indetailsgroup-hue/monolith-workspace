-- =============================================================================
-- Migration 0224: Normalise fpr_payment idempotency_key constraint name
-- =============================================================================
-- Context
--   0212 declared:  idempotency_key TEXT UNIQUE
--   PostgreSQL auto-generated the constraint name: fpr_payment_idempotency_key_key
--   This migration renames it to the canonical project name:
--       uq_fpr_payment_idempotency_key
--   so that downstream code (e.g. ON CONFLICT ON CONSTRAINT) has a stable,
--   predictable name to reference.
--
--   The DO block is fully idempotent:
--     • If the auto-name exists  → rename it to the canonical name
--     • If the canonical name already exists → no-op (safe re-run)
--     • If neither exists        → create the canonical UNIQUE constraint
--       (handles environments where 0212 was applied without the inline UNIQUE)
--
-- Additional index
--   Adds a partial index on non-NULL idempotency_key values for faster
--   ON CONFLICT and lookup performance, guarded by IF NOT EXISTS.
--
-- Safe to run on:
--   • Fresh environments  (constraint absent → CREATE)
--   • Environments with auto-named constraint → RENAME
--   • Environments where 0224 was already run → no-op
-- =============================================================================

DO $$
DECLARE
  v_auto_name   TEXT := 'fpr_payment_idempotency_key_key';
  v_canon_name  TEXT := 'uq_fpr_payment_idempotency_key';
  v_exists_auto  BOOLEAN;
  v_exists_canon BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = 'fpr.fpr_payment'::regclass
      AND  conname   = v_auto_name
      AND  contype   = 'u'
  ) INTO v_exists_auto;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = 'fpr.fpr_payment'::regclass
      AND  conname   = v_canon_name
      AND  contype   = 'u'
  ) INTO v_exists_canon;

  IF v_exists_canon THEN
    -- Canonical constraint already present — nothing to do
    RAISE NOTICE 'uq_fpr_payment_idempotency_key already exists, skipping.';

  ELSIF v_exists_auto THEN
    -- Rename the auto-generated constraint to the canonical name
    EXECUTE format(
      'ALTER TABLE fpr.fpr_payment RENAME CONSTRAINT %I TO %I',
      v_auto_name, v_canon_name
    );
    RAISE NOTICE 'Renamed % → %', v_auto_name, v_canon_name;

  ELSE
    -- Neither exists: create from scratch (e.g. env where 0212 skipped UNIQUE)
    ALTER TABLE fpr.fpr_payment
      ADD CONSTRAINT uq_fpr_payment_idempotency_key
        UNIQUE (idempotency_key);
    RAISE NOTICE 'Created constraint uq_fpr_payment_idempotency_key';

  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Partial index: fast ON CONFLICT / lookup for non-null idempotency keys
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fpr_payment_idempotency_key_nn
  ON fpr.fpr_payment (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON CONSTRAINT uq_fpr_payment_idempotency_key ON fpr.fpr_payment
  IS 'Canonical unique constraint on idempotency_key; renamed from auto-generated '
     'fpr_payment_idempotency_key_key (0212) in migration 0224.'
     'Used by rpc_bulk_record_fpr_payment for ON CONFLICT idempotency guard.';
