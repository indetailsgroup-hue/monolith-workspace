-- =============================================================================
-- Migration 0214 — LINE Rich Menu Config
-- Table  : line_rich_menu_config
-- RPC    : rpc_register_line_rich_menu (governance only)
-- RLS    : fail-closed
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. line_rich_menu_config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.line_rich_menu_config (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rich_menu_id   text        NOT NULL UNIQUE,   -- LINE-issued richMenuId
    menu_name      text        NOT NULL,           -- human-readable label
    description    text,
    is_default     boolean     NOT NULL DEFAULT false,
    linked_user_ids jsonb      NOT NULL DEFAULT '[]'::jsonb,
                                                  -- snapshot of linked LINE user IDs
    activated_at   timestamptz,
    deactivated_at timestamptz,
    created_by     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_rich_menu_config_default
    ON public.line_rich_menu_config (is_default)
    WHERE is_default = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_line_rich_menu_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_line_rich_menu_config_updated_at
    ON public.line_rich_menu_config;
CREATE TRIGGER trg_line_rich_menu_config_updated_at
    BEFORE UPDATE ON public.line_rich_menu_config
    FOR EACH ROW EXECUTE FUNCTION public.fn_line_rich_menu_config_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — fail-closed
-- ---------------------------------------------------------------------------
ALTER TABLE public.line_rich_menu_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "line_rich_menu select" ON public.line_rich_menu_config;
CREATE POLICY "line_rich_menu select"
    ON public.line_rich_menu_config FOR SELECT
    USING (
        has_any_app_role(ARRAY['operator','team_lead','project_manager',
                               'managing_director','finance','governance'])
    );

-- Insert / update only via SECURITY DEFINER RPC (governance)
DROP POLICY IF EXISTS "line_rich_menu insert" ON public.line_rich_menu_config;
CREATE POLICY "line_rich_menu insert"
    ON public.line_rich_menu_config FOR INSERT
    WITH CHECK (is_governance_role());

DROP POLICY IF EXISTS "line_rich_menu update" ON public.line_rich_menu_config;
CREATE POLICY "line_rich_menu update"
    ON public.line_rich_menu_config FOR UPDATE
    USING (is_governance_role())
    WITH CHECK (is_governance_role());

-- ---------------------------------------------------------------------------
-- 3. rpc_register_line_rich_menu
--    Upserts a rich menu record and optionally marks it as the default.
--    When is_default=true, clears the flag on all other rows first.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_register_line_rich_menu(jsonb);
CREATE OR REPLACE FUNCTION public.rpc_register_line_rich_menu(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor         text    := resolve_actor();
    v_rich_menu_id  text    := p_args->>'rich_menu_id';
    v_menu_name     text    := p_args->>'menu_name';
    v_description   text    := p_args->>'description';
    v_is_default    boolean := COALESCE((p_args->>'is_default')::boolean, false);
    v_activated_at  timestamptz := COALESCE(
                                       (p_args->>'activated_at')::timestamptz,
                                       now()
                                   );
    v_id            uuid;
BEGIN
    -- governance only
    IF NOT is_governance_role() THEN
        RETURN jsonb_build_object('ok',false,'error','permission_denied');
    END IF;

    IF v_rich_menu_id IS NULL OR v_menu_name IS NULL THEN
        RETURN jsonb_build_object('ok',false,'error','invalid_arguments');
    END IF;

    -- if setting as default, clear existing default
    IF v_is_default THEN
        UPDATE public.line_rich_menu_config
        SET    is_default = false, updated_at = now()
        WHERE  is_default = true
        AND    rich_menu_id <> v_rich_menu_id;
    END IF;

    INSERT INTO public.line_rich_menu_config
        (rich_menu_id, menu_name, description, is_default,
         activated_at, created_by)
    VALUES
        (v_rich_menu_id, v_menu_name, v_description, v_is_default,
         v_activated_at, v_actor)
    ON CONFLICT (rich_menu_id)
    DO UPDATE SET
        menu_name     = EXCLUDED.menu_name,
        description   = EXCLUDED.description,
        is_default    = EXCLUDED.is_default,
        activated_at  = EXCLUDED.activated_at,
        updated_at    = now()
    RETURNING id INTO v_id;

    -- audit (no request_id — system-level event)
    INSERT INTO public.field_purchase_audit_log
        (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
        null,
        v_actor,
        'line_rich_menu_registered',
        null,
        null,
        jsonb_build_object(
            'config_id',     v_id,
            'rich_menu_id',  v_rich_menu_id,
            'menu_name',     v_menu_name,
            'is_default',    v_is_default
        )
    );

    RETURN jsonb_build_object(
        'ok',           true,
        'config_id',    v_id,
        'rich_menu_id', v_rich_menu_id,
        'is_default',   v_is_default
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_register_line_rich_menu(jsonb)
    TO authenticated, service_role;

COMMIT;
